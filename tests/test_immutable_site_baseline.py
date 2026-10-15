"""Offline Git fixtures: no network, browser, production checkout or credentials."""
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "immutable_site_baseline.py"
spec = importlib.util.spec_from_file_location("immutable_site_baseline", MODULE_PATH)
baseline = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = baseline
spec.loader.exec_module(baseline)


class GitFixture(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.repository = Path(self.temporary.name)
        self.git("init", "-q")
        self.git("config", "user.name", "Offline Fixture")
        self.git("config", "user.email", "fixture@example.invalid")
        (self.repository / "index.html").write_bytes(b"approved\x00literal\xff\n")
        (self.repository / "styles.css").write_bytes(b"body { color: navy }\n")
        (self.repository / "private.md").write_bytes(b"not public")
        self.git("add", ".")
        self.git("commit", "-qm", "offline baseline")
        self.commit = self.git("rev-parse", "HEAD").decode().strip()
        self.tree = self.git("rev-parse", "HEAD^{tree}").decode().strip()
        self.paths = frozenset({"index.html", "styles.css"})

    def tearDown(self):
        self.temporary.cleanup()

    def git(self, *arguments):
        return subprocess.run(["git", "-C", str(self.repository), *arguments],
                              check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                              env={k: v for k, v in os.environ.items() if not k.startswith("GIT_")},
                              timeout=5).stdout

    def loader(self, **overrides):
        options = dict(commit=self.commit, tree=self.tree, paths=self.paths)
        options.update(overrides)
        records = []
        # Fixture digest is captured from original objects before a mocked read.
        for record in self.git("ls-tree", "-rz", "--full-tree", options["tree"]).split(b"\0") if options["tree"] == self.tree else []:
            if record:
                metadata, path = record.split(b"\t", 1)
                mode, kind, sha = metadata.decode().split(" ")
                if path.decode() in options["paths"]:
                    records.append([path.decode(), mode, sha])
        options.setdefault("selected_inventory_sha256", hashlib.sha256(
            json.dumps(sorted(records), ensure_ascii=True, separators=(",", ":")).encode("ascii")).hexdigest())
        return baseline._ObjectBaseline(self.repository, baseline._Policy(**options))

    def test_literal_binary_blob_and_sha256(self):
        result = self.loader()
        self.assertEqual(result.read("index.html"), b"approved\x00literal\xff\n")
        inventory = result.inventory()
        row = inventory["files"][0]
        self.assertEqual(row["sha256"], hashlib.sha256(b"approved\x00literal\xff\n").hexdigest())
        self.assertEqual(row["git_blob"], self.git("rev-parse", self.commit + ":index.html").decode().strip())

    def test_dirty_deleted_untracked_worktree_ignored(self):
        (self.repository / "index.html").write_bytes(b"DIRTY")
        (self.repository / "styles.css").unlink()
        (self.repository / "private.js").write_bytes(b"untracked")
        result = self.loader()
        self.assertEqual(result.read("index.html"), b"approved\x00literal\xff\n")
        self.assertEqual(result.read("styles.css"), b"body { color: navy }\n")
        with self.assertRaises(baseline.BaselineError):
            result.read("private.js")

    def test_inventory_deterministic_and_not_acceptance(self):
        first = self.loader().inventory()
        second = self.loader().inventory()
        self.assertEqual(json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True))
        self.assertEqual([r["path"] for r in first["files"]], sorted(self.paths))
        self.assertFalse(first["visual_acceptance"])
        self.assertFalse(first["deployment_verified"])
        self.assertEqual(first["total_bytes"], sum(r["size"] for r in first["files"]))

    def test_private_and_path_refusals(self):
        result = self.loader()
        for path in ("private.md", "../index.html", "/index.html", "./index.html", "a//b",
                     "api/contact.js", ".git/config", "preview/index.html", "services-green.html",
                     "assets/library/README.md", "a\\b", "index.html\n", "", None):
            with self.subTest(path=path), self.assertRaises(baseline.BaselineError):
                result.read(path)

    def test_wrong_pin_and_missing_object(self):
        for commit in ("main", "HEAD", self.commit + "^", "0" * 40, "G" * 40):
            with self.subTest(commit=commit), self.assertRaises(baseline.BaselineError):
                self.loader(commit=commit)

    def test_wrong_tree(self):
        with self.assertRaises(baseline.BaselineError):
            self.loader(tree="0" * 40)

    def test_missing_allowlisted_path(self):
        with self.assertRaises(baseline.BaselineError):
            self.loader(paths=frozenset({"absent.html"}))

    def test_symlink_refused(self):
        (self.repository / "link.html").symlink_to("index.html")
        self.git("add", "link.html")
        self.git("commit", "-qm", "fixture link")
        commit = self.git("rev-parse", "HEAD").decode().strip()
        tree = self.git("rev-parse", "HEAD^{tree}").decode().strip()
        with self.assertRaises(baseline.BaselineError):
            self.loader(commit=commit, tree=tree, paths=frozenset({"link.html"}))

    def test_gitlink_refused(self):
        self.git("update-index", "--add", "--cacheinfo", "160000," + self.commit + ",submodule")
        self.git("commit", "-qm", "fixture gitlink")
        commit = self.git("rev-parse", "HEAD").decode().strip()
        tree = self.git("rev-parse", "HEAD^{tree}").decode().strip()
        with self.assertRaises(baseline.BaselineError):
            self.loader(commit=commit, tree=tree, paths=frozenset({"submodule"}))

    def test_file_byte_cap(self):
        result = self.loader(max_file=3)
        with self.assertRaises(baseline.BaselineError):
            result.read("index.html")

    def test_total_byte_cap(self):
        result = self.loader(max_total=20)
        result.read("index.html")
        with self.assertRaises(baseline.BaselineError):
            result.read("styles.css")

    def test_cached_reads_do_not_recharge_bytes(self):
        result = self.loader(max_total=18)
        expected = result.read("index.html")
        self.assertIs(result.read("index.html"), expected)
        self.assertEqual(result._total, len(expected))

    def test_replacement_refs_ignored(self):
        original = self.git("rev-parse", self.commit + ":index.html").decode().strip()
        replacement = subprocess.run(["git", "-C", str(self.repository), "hash-object", "-w", "--stdin"],
                                     input=b"REPLACED", check=True, stdout=subprocess.PIPE, timeout=5).stdout.decode().strip()
        self.git("replace", original, replacement)
        self.assertEqual(self.loader().read("index.html"), b"approved\x00literal\xff\n")

    def test_inherited_git_redirections_ignored(self):
        with mock.patch.dict(os.environ, {"GIT_DIR": "/not-a-repository",
                                         "GIT_WORK_TREE": "/not-a-worktree",
                                         "GIT_CONFIG_COUNT": "1", "GIT_CONFIG_KEY_0": "core.pager",
                                         "GIT_CONFIG_VALUE_0": "false"}):
            self.assertEqual(self.loader().read("index.html"), b"approved\x00literal\xff\n")

    def test_corrupted_blob_bytes_fail_identity(self):
        result = self.loader()
        original = result._git.run
        def tamper(arguments, limit, timeout=5.0):
            if arguments[:2] == ["cat-file", "blob"]:
                return b"x" * 18
            return original(arguments, limit, timeout)
        with mock.patch.object(result._git, "run", side_effect=tamper):
            with self.assertRaises(baseline.BaselineError):
                result.read("index.html")

    def test_nested_listing_substitution_fails_pinned_inventory(self):
        # Another valid blob cannot replace a selected path through corrupt
        # recursive-tree metadata, even though its own object hash is valid.
        old = self.git("rev-parse", self.commit + ":index.html").strip()
        replacement = self.git("rev-parse", self.commit + ":styles.css").strip()
        original = baseline._Git.run
        def tamper(runner, arguments, limit, timeout=5.0):
            data = original(runner, arguments, limit, timeout)
            if arguments[0] == "ls-tree":
                return data.replace(old, replacement)
            return data
        with mock.patch.object(baseline._Git, "run", new=tamper):
            with self.assertRaisesRegex(baseline.BaselineError, "selected inventory mismatch"):
                self.loader()

    def test_wrong_selected_inventory_digest_refused(self):
        with self.assertRaisesRegex(baseline.BaselineError, "selected inventory mismatch"):
            self.loader(selected_inventory_sha256="0" * 64)

    def test_cli_production_pin_missing_fails(self):
        with mock.patch("sys.stderr", new_callable=io.StringIO) as stderr:
            self.assertEqual(baseline.main(["--repository", str(self.repository)]), 1)
            self.assertIn("Baseline refused", stderr.getvalue())

    def test_cli_no_revision_escape(self):
        with mock.patch("sys.stderr", new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as error:
                baseline.main(["--repository", str(self.repository), "--revision", self.commit])
            self.assertEqual(error.exception.code, 2)

    def test_production_allowlist_exact_scope(self):
        self.assertEqual(len(baseline.PUBLIC_PATHS), 83)
        self.assertEqual(sum(p.endswith(".html") for p in baseline.PUBLIC_PATHS), 27)
        for path in baseline.PUBLIC_PATHS:
            self.assertTrue(baseline._safe_path(path))
            self.assertFalse(path.endswith((".md", ".b64")))
            self.assertFalse(path.startswith(("api/", "docs/", "tests/", "scripts/", "preview/")))
        self.assertNotIn("services-green.html", baseline.PUBLIC_PATHS)
        self.assertNotIn("assets/library/manifest.json", baseline.PUBLIC_PATHS)

    def test_git_error(self):
        with self.assertRaises(baseline.BaselineError):
            baseline._Git(self.repository).run(["not-a-valid-command"], 128)

    def test_command_budget(self):
        runner = baseline._Git(self.repository)
        runner.calls = 256
        with self.assertRaises(baseline.BaselineError):
            runner.run(["cat-file", "-s", self.commit], 32)

    def test_total_time_budget(self):
        runner = baseline._Git(self.repository)
        runner.started -= 61
        with self.assertRaises(baseline.BaselineError):
            runner.run(["cat-file", "-s", self.commit], 32)


class ProcessBounds(unittest.TestCase):
    def child(self, code, limit, timeout=1):
        actual_popen = subprocess.Popen
        def spawn(*args, **kwargs):
            return actual_popen([sys.executable, "-c", code], **kwargs)
        with mock.patch.object(baseline.subprocess, "Popen", side_effect=spawn):
            return baseline._Git(Path(".")).run([], limit, timeout)

    def test_stdout_bound(self):
        with self.assertRaisesRegex(baseline.BaselineError, "output exceeded"):
            self.child("import os; os.write(1, b'x' * 10000)", 100)

    def test_stderr_bound(self):
        with self.assertRaisesRegex(baseline.BaselineError, "output exceeded"):
            self.child("import os; os.write(2, b'x' * 70000)", 100)

    def test_timeout_kills_child(self):
        with self.assertRaisesRegex(baseline.BaselineError, "timed out"):
            self.child("import time; time.sleep(2)", 100, timeout=0.05)

    def test_nonzero_child_fails(self):
        with self.assertRaises(baseline.BaselineError):
            self.child("raise SystemExit(4)", 100)

    def test_missing_git_start(self):
        with mock.patch.object(baseline.subprocess, "Popen", side_effect=FileNotFoundError):
            with self.assertRaises(baseline.BaselineError):
                baseline._Git(Path(".")).run([], 100)


if __name__ == "__main__":
    unittest.main()

