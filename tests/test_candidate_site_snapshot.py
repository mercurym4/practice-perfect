"""Candidate read-only object-chain tests; fixtures never establish actual-head CI."""
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import candidate_site_snapshot as candidate
from immutable_site_baseline import BaselineError, _Git, _object_hash

PATHS = sorted(candidate.CANDIDATE_PUBLIC_PATHS)
DATA = {path: b"\x00\xff\x80fixture:" + path.encode("ascii") for path in PATHS}


class ObjectFixture:
    def __init__(self, missing=None, modes=None):
        self.objects = {}
        modes = modes or {}
        nested = {}
        for path in PATHS:
            if path == missing:
                continue
            node = nested
            components = path.split("/")
            for part in components[:-1]:
                node = node.setdefault(part, {})
            node[components[-1]] = (modes.get(path, "100644"), self.put("blob", DATA[path]))
        # Real repositories contain private files. They must never enter public output.
        nested["private.txt"] = ("100644", self.put("blob", b"private fixture"))
        def tree(node):
            items = []
            for name, value in node.items():
                mode, oid = ("40000", tree(value)) if isinstance(value, dict) else value
                items.append((name.encode(), mode, oid))
            items.sort(key=lambda row: row[0] + (b"/" if row[1] == "40000" else b""))
            raw = b"".join(mode.encode() + b" " + name + b"\0" + bytes.fromhex(oid)
                           for name, mode, oid in items)
            return self.put("tree", raw)
        self.tree = tree(nested)
        raw = (b"tree " + self.tree.encode() +
               b"\nauthor Fixture <fixture@example.invalid> 1 +0000\n"
               b"committer Fixture <fixture@example.invalid> 1 +0000\n\nfixture\n")
        self.commit = self.put("commit", raw)
    def put(self, kind, raw):
        oid = _object_hash(kind, raw)
        self.objects[(kind, oid)] = raw
        return oid
    def run(self, arguments, limit):
        if arguments[:2] == ["cat-file", "-s"]:
            options = [data for (kind, oid), data in self.objects.items() if oid == arguments[2]]
            if not options:
                raise BaselineError("Fixture missing")
            data = str(len(options[0])).encode() + b"\n"
        else:
            data = self.objects.get((arguments[1], arguments[2]))
            if data is None:
                raise BaselineError("Fixture missing")
        if len(data) > limit:
            raise BaselineError("Fixture output exceeds bound")
        return data


class CandidateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="pp-candidate-git-")
        cls.repository = Path(cls.temp.name)
        cls.environment = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
        cls.environment.update(GIT_CONFIG_NOSYSTEM="1", GIT_CONFIG_GLOBAL=os.devnull,
                               GIT_TERMINAL_PROMPT="0", LC_ALL="C")
        def git(*arguments):
            return subprocess.run(["git", "-c", "core.hooksPath=/dev/null",
                                   "-C", str(cls.repository), *arguments],
                                  check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  env=cls.environment, timeout=5).stdout
        git("init", "-q", "--template=")
        for path, data in DATA.items():
            target = cls.repository / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        (cls.repository / "private.txt").write_bytes(b"private fixture")
        git("add", "--all")
        git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
            "-c", "commit.gpgsign=false", "commit", "-qm", "fixture")
        cls.actual_commit = git("rev-parse", "HEAD").decode().strip()
    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()
    def setUp(self):
        self.fixture = ObjectFixture()
        self.calls = []
        self.patcher = patch.object(candidate._Git, "run", side_effect=self.fake_run)
        self.runner = self.patcher.start()
        self.addCleanup(patch.stopall)
    def fake_run(self, arguments, limit, timeout=5.0):
        self.calls.append((arguments, limit))
        return self.fixture.run(arguments, limit)
    def snapshot(self):
        return candidate.CandidateSiteSnapshot(self.repository, self.fixture.commit)
    def test_actual_local_git_84_file_binary_roundtrip(self):
        self.patcher.stop()
        snapshot = candidate.CandidateSiteSnapshot(self.repository, self.actual_commit)
        report = snapshot.inventory()
        self.assertEqual(report["file_count"], 84)
        self.assertEqual(report["candidate_commit"], self.actual_commit)
        self.assertEqual(report["total_bytes"], sum(map(len, DATA.values())))
        self.assertIs(report["renderer_verified"], False)
        self.assertIs(report["visual_acceptance"], False)
        self.assertIs(report["deployment_verified"], False)
        for path, data in DATA.items():
            self.assertEqual(snapshot.read(path), data)
        self.assertLessEqual(snapshot._git.calls, 256)
    def test_complete_authenticated_fake_graph_and_metadata(self):
        snapshot = self.snapshot()
        report = snapshot.inventory()
        rows = report["files"]
        self.assertEqual([row["path"] for row in rows], PATHS)
        canonical = json.dumps([[r["path"], r["mode"], r["git_blob"]] for r in rows],
                               separators=(",", ":")).encode()
        self.assertEqual(hashlib.sha256(canonical).hexdigest(),
                         report["selected_inventory_sha256"])
        self.assertTrue(all(arguments[0] == "cat-file" for arguments, _ in self.calls))
        self.assertFalse(any("ls-tree" in arguments for arguments, _ in self.calls))
        self.assertEqual(snapshot.read("mobile-menu.js"), DATA["mobile-menu.js"])
    def test_full_lowercase_commit_only_before_git(self):
        for commit in ["HEAD", "main", "a"*39, "A"*40, "a"*41, None, [], "a"*40+"\n"]:
            with self.assertRaises(candidate.CandidateSnapshotError):
                candidate.CandidateSiteSnapshot(self.repository, commit)
        self.assertEqual(self.calls, [])
    def test_wrong_commit_raw_identity(self):
        self.fixture.objects[("commit", self.fixture.commit)] += b"changed"
        with self.assertRaisesRegex(BaselineError, "commit identity"):
            self.snapshot()
    def test_missing_commit(self):
        with self.assertRaises(BaselineError):
            candidate.CandidateSiteSnapshot(self.repository, "0"*40)
    def test_wrong_root_tree_raw_identity(self):
        self.fixture.objects[("tree", self.fixture.tree)] = b""
        with self.assertRaisesRegex(BaselineError, "tree identity"):
            self.snapshot()
    def test_wrong_nested_tree_identity(self):
        root = candidate._parse_tree(self.fixture.objects[("tree", self.fixture.tree)])
        oid = root[b"assets"][1]
        self.fixture.objects[("tree", oid)] = b""
        with self.assertRaisesRegex(BaselineError, "tree identity"):
            self.snapshot()
    def test_valid_other_tree_cannot_substitute_nested_mapping(self):
        root = candidate._parse_tree(self.fixture.objects[("tree", self.fixture.tree)])
        oid = root[b"assets"][1]
        valid_other_tree = self.fixture.objects[("tree", root[b"resources"][1])]
        self.fixture.objects[("tree", oid)] = valid_other_tree
        with self.assertRaisesRegex(BaselineError, "tree identity"):
            self.snapshot()
    def test_first_unique_commit_tree_header(self):
        for raw in [b"author fixture\n\nmessage",
                    b"tree " + self.fixture.tree.encode() + b"\ntree " + self.fixture.tree.encode() + b"\n\nx",
                    b"tree " + self.fixture.tree.encode() + b"\nmissing blank separator"]:
            oid = self.fixture.put("commit", raw)
            with self.assertRaises(BaselineError):
                candidate.CandidateSiteSnapshot(self.repository, oid)
    def test_missing_selected_file(self):
        self.fixture = ObjectFixture(missing="mobile-menu.js")
        with self.assertRaisesRegex(BaselineError, "path missing"):
            self.snapshot()
    def test_selected_leaf_symlink_or_submodule(self):
        for mode in ["120000", "160000"]:
            self.fixture = ObjectFixture(modes={"about.html": mode})
            with self.assertRaisesRegex(BaselineError, "regular blob"):
                self.snapshot()
    def test_selected_ancestor_not_tree(self):
        # Valid authenticated raw root, but assets is a blob rather than a directory.
        root = candidate._parse_tree(self.fixture.objects[("tree", self.fixture.tree)])
        entries = []
        for name, (mode, oid) in root.items():
            if name == b"assets":
                mode, oid = "100644", self.fixture.put("blob", b"not a tree")
            entries.append((name, mode, oid))
        entries.sort(key=lambda r:r[0]+(b"/" if r[1]=="40000" else b""))
        raw = b"".join(mode.encode()+b" "+name+b"\0"+bytes.fromhex(oid) for name,mode,oid in entries)
        tree = self.fixture.put("tree", raw)
        commit = self.fixture.put("commit", b"tree "+tree.encode()+b"\n\nfixture")
        with self.assertRaisesRegex(BaselineError, "ancestor"):
            candidate.CandidateSiteSnapshot(self.repository, commit)
    def test_private_extra_traversal_paths_not_exported(self):
        snapshot = self.snapshot()
        for path in ["private.txt", "docs/private.md", "../about.html", "/about.html",
                     "about.html?q=x", "assets//x", "assets\\x", "%61bout.html", 1, []]:
            with self.assertRaises(BaselineError):
                snapshot.read(path)
        self.assertEqual(snapshot.inventory()["file_count"], 84)
    def test_dirty_worktree_is_never_candidate_source(self):
        (self.repository/"about.html").write_bytes(b"dirty text")
        self.patcher.stop()
        snapshot = candidate.CandidateSiteSnapshot(self.repository, self.actual_commit)
        self.assertEqual(snapshot.read("about.html"), DATA["about.html"])
    def test_returned_bytes_immutable_and_reads_cached(self):
        snapshot = self.snapshot()
        data = snapshot.read("about.html")
        before = len(self.calls)
        with self.assertRaises(TypeError):
            data[0] = 42
        self.assertEqual(snapshot.read("about.html"), data)
        self.assertEqual(len(self.calls), before)
    def test_blob_identity_mismatch(self):
        snapshot = self.snapshot()
        oid = snapshot._entries["about.html"][1]
        self.fixture.objects[("blob",oid)] = b"x"*len(DATA["about.html"])
        with self.assertRaisesRegex(BaselineError,"blob identity"):
            snapshot.read("about.html")
    def test_missing_blob_has_no_worktree_fallback(self):
        snapshot = self.snapshot()
        oid = snapshot._entries["about.html"][1]
        self.fixture.objects.pop(("blob",oid))
        with self.assertRaises(BaselineError):
            snapshot.read("about.html")
    def test_failed_blob_read_retains_aggregate_reservation(self):
        snapshot = self.snapshot()
        oid = snapshot._entries["about.html"][1]
        old = self.fixture.run
        def fail_blob(args, limit):
            if args[:2] == ["cat-file","blob"]:
                raise BaselineError("fixture failure")
            return old(args,limit)
        self.fixture.run = fail_blob
        for index in range(2):
            with self.assertRaises(BaselineError):
                snapshot.read("about.html")
            self.assertEqual(snapshot._blob_reserved, (index+1)*len(DATA["about.html"]))
    def test_failed_metadata_read_retains_reservation(self):
        snapshot = self.snapshot()
        before = snapshot._metadata_reserved
        with self.assertRaises(BaselineError):
            snapshot._metadata(["cat-file","tree","0"*40],64)
        self.assertEqual(snapshot._metadata_reserved, before+64)
    def test_failed_read_retries_cannot_reset_total_budget(self):
        snapshot=self.snapshot()
        size=len(DATA["about.html"])
        old=self.fixture.run
        def fail_blob(args,limit):
            if args[:2]==["cat-file","blob"]:
                raise BaselineError("fixture failure")
            return old(args,limit)
        self.fixture.run=fail_blob
        with patch.object(candidate,"MAX_TOTAL_BYTES",2*size):
            for _ in range(2):
                with self.assertRaises(BaselineError):
                    snapshot.read("about.html")
            before=len([a for a,_ in self.calls if a[:2]==["cat-file","blob"]])
            with self.assertRaisesRegex(BaselineError,"byte budget"):
                snapshot.read("about.html")
            self.assertEqual(len([a for a,_ in self.calls if a[:2]==["cat-file","blob"]]),before)
            self.assertEqual(snapshot._blob_reserved,2*size)
    def test_failed_metadata_retries_cannot_reset_total_budget(self):
        snapshot=self.snapshot()
        initial=snapshot._metadata_reserved
        with patch.object(candidate,"MAX_METADATA_BYTES",initial+128):
            for _ in range(2):
                with self.assertRaises(BaselineError):
                    snapshot._metadata(["cat-file","tree","0"*40],64)
            before=len(self.calls)
            with self.assertRaisesRegex(BaselineError,"metadata budget"):
                snapshot._metadata(["cat-file","tree","0"*40],64)
            self.assertEqual(len(self.calls),before)
    def test_metadata_aggregate_cap(self):
        with patch.object(candidate,"MAX_METADATA_BYTES",1):
            with self.assertRaises(BaselineError):
                self.snapshot()
    def test_metadata_per_object_cap(self):
        with patch.object(candidate,"MAX_METADATA_OBJECT_BYTES",1):
            with self.assertRaises(BaselineError):
                self.snapshot()
    def test_blob_file_budget(self):
        snapshot=self.snapshot()
        with patch.object(candidate,"MAX_FILE_BYTES",1):
            with self.assertRaises(BaselineError):
                snapshot.read("about.html")
    def test_blob_aggregate_cap(self):
        snapshot=self.snapshot()
        with patch.object(candidate,"MAX_TOTAL_BYTES",len(DATA["about.html"])):
            snapshot.read("about.html")
            with self.assertRaises(BaselineError):
                snapshot.read("analytics.js")
    def test_invalid_blob_size(self):
        snapshot=self.snapshot()
        old=self.fixture.run
        for bad in [b"-1\n",b"01\n",b"1",b"1e3\n"]:
            self.fixture.run=lambda args,limit,bad=bad: bad if args[:2]==["cat-file","-s"] else old(args,limit)
            with self.assertRaises(BaselineError):
                snapshot.read("about.html")
        self.fixture.run=old
    def test_existing_git_command_and_elapsed_budgets(self):
        self.patcher.stop()
        git=_Git(self.repository)
        git.calls=256
        with self.assertRaisesRegex(BaselineError,"budget"):
            git.run(["cat-file","commit",self.actual_commit],100)
        git=_Git(self.repository);git.started=time.monotonic()-61
        with self.assertRaisesRegex(BaselineError,"budget"):
            git.run(["cat-file","commit",self.actual_commit],100)
    def test_cli_refusal_redacts_errors(self):
        with patch.object(candidate,"CandidateSiteSnapshot",side_effect=BaselineError("secret source")):
            with contextlib.redirect_stderr(io.StringIO()) as error, contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(candidate.main(["--repository","fixture","--commit","0"*40]),1)
                self.assertEqual(out.getvalue(),"")
                self.assertEqual(error.getvalue(),"Candidate public snapshot refused\n")
    def test_cli_summary_success_without_payload(self):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(candidate.main(["--repository","fixture","--commit",self.fixture.commit]),0)
        report=json.loads(out.getvalue())
        self.assertEqual(report["file_count"],84)
        self.assertEqual(report["candidate_commit"],self.fixture.commit)
        self.assertNotIn("data",report["files"][0])
        self.assertIs(report["renderer_verified"],False)
        self.assertIs(report["deployment_verified"],False)
    def test_public_provenance_cannot_be_relabelled(self):
        snapshot=self.snapshot()
        original=snapshot.inventory()
        for attribute in ["commit","tree","selected_inventory_sha256"]:
            with self.assertRaises(AttributeError):
                setattr(snapshot,attribute,"0"*40)
        self.assertEqual(snapshot.inventory(),original)
    def test_cli_requires_commit_and_rejects_ref_override(self):
        for argv in [["--repository","fixture"],["--repository","fixture","--commit","0"*40,"--ref","HEAD"]]:
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                candidate.main(argv)


class TreeParserTests(unittest.TestCase):
    def entry(self,name=b"a",mode=b"100644",oid=b"\0"*20):
        return mode+b" "+name+b"\0"+oid
    def test_empty_authenticated_tree_parse(self):
        self.assertEqual(candidate._parse_tree(b""),{})
    def test_duplicate_raw_names(self):
        with self.assertRaises(BaselineError):
            candidate._parse_tree(self.entry()+self.entry())
    def test_truncated_mode_name_or_oid(self):
        for raw in [b"100644",b"100644 a",self.entry()[:-1],self.entry()+b"x"]:
            with self.assertRaises(BaselineError):
                candidate._parse_tree(raw)
    def test_invalid_names_modes_and_order(self):
        for raw in [self.entry(name=b""),self.entry(name=b"a/b"),self.entry(name=b".."),
                    self.entry(name=b"x"*256),self.entry(mode=b"100664"),
                    self.entry(name=b"z")+self.entry(name=b"a")]:
            with self.assertRaises(BaselineError):
                candidate._parse_tree(raw)
    def test_git_directory_sort_order(self):
        raw=self.entry(b"a.c")+self.entry(b"a",b"40000")+self.entry(b"b")
        self.assertEqual(len(candidate._parse_tree(raw)),3)

if __name__ == "__main__":
    unittest.main()

