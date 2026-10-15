#!/usr/bin/env python3
"""Private fixtures; production exporter has no policy override."""
import base64
import copy
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import export_candidate_snapshot as target
from immutable_site_baseline import BaselineError

COMMIT = "1" * 40
TREE = "2" * 40


class Fixture:
    def __init__(self, repository, commit):
        self.data = {p: bytes([0, 255, 128, i, 10])
                     for i, p in enumerate(sorted(target.CANDIDATE_PUBLIC_PATHS))}
        self.rows = [{"path": p, "mode": "100644", "git_blob": target._blob(b),
                      "size": len(b), "sha256": hashlib.sha256(b).hexdigest()}
                     for p, b in self.data.items()]
        self.mapping = hashlib.sha256(json.dumps(
            [[r["path"],r["mode"],r["git_blob"]] for r in self.rows],
            ensure_ascii=True, separators=(",", ":")).encode("ascii")).hexdigest()

    def read(self, path):
        return self.data[path]

    def inventory(self):
        return {"schema": 1, "repository": target.REPOSITORY,
                "candidate_commit": COMMIT, "candidate_tree": TREE,
                "selected_inventory_sha256": self.mapping, "source": target.SOURCE,
                "file_count": 84, "total_bytes": sum(len(b) for b in self.data.values()),
                "files": copy.deepcopy(self.rows), "renderer_verified": False,
                "visual_acceptance": False, "deployment_verified": False}


class ExporterTests(unittest.TestCase):
    def setUp(self):
        self.fixture = Fixture(".", COMMIT)

    def build(self, mutate=None, data_mutate=None):
        inventory = self.fixture.inventory()
        if mutate:
            mutate(inventory)
        if data_mutate:
            data_mutate(self.fixture)
        with patch.object(target, "CandidateSiteSnapshot", return_value=self.fixture), \
                patch.object(target, "SELECTED_INVENTORY_SHA256", self.fixture.mapping), \
                patch.object(self.fixture, "inventory", return_value=inventory):
            return target.build_snapshot(".", COMMIT)

    def test_canonical_full84_binary(self):
        raw = self.build()
        self.assertEqual(raw[-1:], b"\n")
        value = json.loads(raw)
        self.assertEqual(raw, (json.dumps(value, ensure_ascii=True, separators=(",", ":"))+"\n").encode("ascii"))
        self.assertEqual(len(value), 14)
        self.assertEqual(value[3:5], [COMMIT, TREE])
        self.assertEqual(value[7:11], [True,False,False,False])
        self.assertEqual(value[11:13], [84,420])
        self.assertEqual(len(value[13]),84)
        for row in value[13]:
            self.assertEqual(base64.b64decode(row[5]), self.fixture.read(row[0]))

    def test_production_pin_refuses_synthetic(self):
        with patch.object(target, "CandidateSiteSnapshot", return_value=self.fixture):
            with self.assertRaises(BaselineError):
                target.build_snapshot(".", COMMIT)

    def test_invalid_expected_commits_before_reader(self):
        for c in [None, {}, "main", "1"*39, "A"*40, COMMIT+"\n"]:
            with self.subTest(commit=c), patch.object(target,"CandidateSiteSnapshot") as reader:
                with self.assertRaises(BaselineError):
                    target.build_snapshot(".",c)
                reader.assert_not_called()

    def test_inventory_fields(self):
        mutations = [
            lambda v: v.update(extra=1),
            lambda v: v.pop("source"),
            lambda v: v.update(schema=True),
            lambda v: v.update(repository="other/site"),
            lambda v: v.update(candidate_commit="3"*40),
            lambda v: v.update(candidate_tree="A"*40),
            lambda v: v.update(candidate_tree=7),
            lambda v: v.update(selected_inventory_sha256="0"*64),
            lambda v: v.update(source="worktree"),
            lambda v: v.update(renderer_verified=True),
            lambda v: v.update(visual_acceptance=True),
            lambda v: v.update(deployment_verified=True),
            lambda v: v.update(file_count=True),
            lambda v: v.update(file_count=83),
            lambda v: v.update(total_bytes=True),
            lambda v: v.update(total_bytes=-1),
            lambda v: v.update(total_bytes=target.MAX_TOTAL_BYTES+1),
            lambda v: v.update(total_bytes=421),
            lambda v: v.update(files={}),
            lambda v: v["files"].pop(),
            lambda v: v["files"].append(v["files"][0]),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation), self.assertRaises(BaselineError):
                self.build(mutation)

    def test_entry_fields(self):
        mutations = [
            lambda r: r.update(extra=1), lambda r: r.pop("path"),
            lambda r: r.update(path="../index.html"),lambda r: r.update(mode="120000"),
            lambda r: r.update(mode=100644), lambda r: r.update(git_blob="A"*40),
            lambda r: r.update(git_blob="0"*40),lambda r: r.update(sha256="0"*64),
            lambda r: r.update(sha256=7),lambda r: r.update(size=True),
            lambda r: r.update(size=-1),lambda r: r.update(size=target.MAX_FILE_BYTES+1),
            lambda r: r.update(size=6),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutation), self.assertRaises(BaselineError):
                self.build(lambda v: mutation(v["files"][0]))

    def test_order_refused(self):
        def reorder(v):
            v["files"][0],v["files"][1]=v["files"][1],v["files"][0]
        with self.assertRaises(BaselineError):
            self.build(reorder)

    def test_nonbytes_refused(self):
        with self.assertRaises(BaselineError):
            self.build(data_mutate=lambda f:f.data.update({"about.html":bytearray(b"12345")}))

    def test_changed_literal_bytes_refused(self):
        with self.assertRaises(BaselineError):
            self.build(data_mutate=lambda f:f.data.update({"about.html":b"changed"}))

    def test_mapping_recomputed_not_inventory_claim(self):
        def mutate(v):
            for r in v["files"]:
                r["mode"]="100755"
        with self.assertRaises(BaselineError):
            self.build(mutate)

    def test_json_budget(self):
        with patch.object(target,"MAX_JSON_BYTES",100),self.assertRaises(BaselineError):
            self.build()

    def test_aggregate_budget(self):
        with patch.object(target,"MAX_TOTAL_BYTES",419),self.assertRaises(BaselineError):
            self.build()

    def test_file_budget(self):
        with patch.object(target,"MAX_FILE_BYTES",4),self.assertRaises(BaselineError):
            self.build()

    def test_cli_refusal_redacted(self):
        output=io.StringIO()
        with patch.object(target,"build_snapshot",side_effect=BaselineError("SECRET")), \
                patch("sys.stderr",output):
            self.assertEqual(target.main(["--repository","SECRET","--commit",COMMIT]),1)
        self.assertEqual(output.getvalue(),"Candidate snapshot envelope refused\n")

    def test_cli_no_override(self):
        for args in [[],["--repository","."],["--repository",".","--commit",COMMIT,"--policy","secret"]]:
            with self.subTest(args=args), patch("sys.stderr",io.StringIO()), self.assertRaises(SystemExit):
                target.main(args)

    def test_python_node_binary_interoperability_fixture_only(self):
        # This private VM pin seam is not exported by production JS or its CLI.
        raw=self.build()
        module=Path(__file__).with_name("candidate-snapshot-contract.cjs")
        js="""const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(process.argv[1],'utf8');
const mapping=process.argv[2],expected=process.argv[3];
const sandbox={require,module:{exports:{}},Buffer};
vm.runInNewContext(source.replace("const MAPPING = '47e1b87881df615984cd81a6ee2ee63e93ba69c846704e8f24c7ab1fc8281800';",
"const MAPPING = '"+mapping+"';"),sandbox);
const s=sandbox.module.exports.decodeCandidateSnapshot(fs.readFileSync(0),expected);
process.stdout.write(JSON.stringify({count:s.fileCount,total:s.totalBytes,
bytes:[...s.read('about.html')],mapping:s.publicMappingAuthenticated,chain:s.commitChainVerified}));"""
        result=subprocess.run(["node","-e",js,str(module),self.fixture.mapping,COMMIT],
            input=raw,capture_output=True,timeout=5,check=True)
        self.assertEqual(json.loads(result.stdout),
            {"count":84,"total":420,"bytes":[0,255,128,0,10],"mapping":True,"chain":False})


if __name__ == "__main__":
    unittest.main()
