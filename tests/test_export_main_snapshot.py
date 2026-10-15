"""Pure exporter contract tests; mocked bytes are never evidence for production Git."""
import base64
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
# The production loader remains an existing dependency; tests may locate its copy
# beside the exporter or through PYTHONPATH in a private source-only review tree.
import export_main_snapshot as exporter
from immutable_site_baseline import BaselineError, PUBLIC_PATHS

class Fixture:
    def __init__(self):
        self.data = {path: ("fixture:" + path).encode("ascii") for path in sorted(PUBLIC_PATHS)}
        self.files = [{"path": path, "git_blob": exporter._sha1_blob(data), "mode": "100644",
                       "size": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                      for path, data in self.data.items()]
        self.mapping = hashlib.sha256(json.dumps(
            [[r["path"], r["mode"], r["git_blob"]] for r in self.files],
            separators=(",", ":")).encode("ascii")).hexdigest()
        self.report = {"schema": 1, "repository": exporter.REPOSITORY,
                       "baseline_commit": exporter.BASELINE_COMMIT,
                       "baseline_tree": exporter.BASELINE_TREE,
                       "selected_inventory_sha256": self.mapping, "source": exporter.SOURCE,
                       "file_count": 83, "total_bytes": sum(map(len, self.data.values())),
                       "files": self.files, "visual_acceptance": False, "deployment_verified": False}
    def inventory(self):
        return self.report
    def read(self, path):
        return self.data[path]

class ExportContractTests(unittest.TestCase):
    def setUp(self):
        self.fixture = Fixture()
        self.loader = patch.object(exporter, "ApprovedMainBaseline", return_value=self.fixture).start()
        self.mapping = patch.object(exporter, "SELECTED_INVENTORY_SHA256", self.fixture.mapping).start()
        self.addCleanup(patch.stopall)
    def export(self):
        return exporter.build_snapshot("fixture-local-only")
    def refused(self):
        with self.assertRaises(BaselineError):
            self.export()
    def test_complete_canonical_array(self):
        raw = self.export()
        value = json.loads(raw)
        self.assertEqual(raw, json.dumps(value, separators=(",", ":")).encode() + b"\n")
        self.assertEqual(len(value), 12)
        self.assertEqual(value[9], 83)
        self.assertEqual(value[3], "86894c29c5d02baad35b3cc47815d2d0ec06315e")
        self.assertEqual(value[4], "f09903750fa6d6c8b6df16a7fe818bb92692154d")
        self.assertIs(value[7], False)
        self.assertIs(value[8], False)
        for row in value[-1]:
            self.assertEqual(base64.b64decode(row[-1]), self.fixture.data[row[0]])
        self.loader.assert_called_once_with("fixture-local-only")
    def test_production_mapping_rejects_fixtures(self):
        with patch.object(exporter, "SELECTED_INVENTORY_SHA256",
                          "6378328e0fb0b02fab38e692b9b0f2706197a7eafa3f50aff14b5dd1d790582d"):
            self.refused()
    def test_wrong_commit(self):
        self.fixture.report["baseline_commit"] = "0" * 40
        self.refused()
    def test_wrong_tree(self):
        self.fixture.report["baseline_tree"] = "0" * 40
        self.refused()
    def test_wrong_repository(self):
        self.fixture.report["repository"] = "untrusted/repo"
        self.refused()
    def test_wrong_mapping(self):
        self.fixture.report["selected_inventory_sha256"] = "0" * 64
        self.refused()
    def test_nonliteral_source(self):
        self.fixture.report["source"] = "worktree"
        self.refused()
    def test_claims_false_only(self):
        for key in ("visual_acceptance", "deployment_verified"):
            self.fixture.report[key] = True
            self.refused()
            self.fixture.report[key] = False
    def test_extra_inventory_field(self):
        self.fixture.report["debug"] = "not allowed"
        self.refused()
    def test_bool_not_integer(self):
        self.fixture.report["schema"] = True
        self.refused()
    def test_missing_path(self):
        self.fixture.files.pop()
        self.refused()
    def test_extra_path(self):
        self.fixture.files.append(dict(self.fixture.files[0]))
        self.refused()
    def test_swapped_paths(self):
        self.fixture.files[0], self.fixture.files[1] = self.fixture.files[1], self.fixture.files[0]
        self.refused()
    def test_duplicate_path(self):
        self.fixture.files[1] = dict(self.fixture.files[0])
        self.refused()
    def test_private_path(self):
        self.fixture.files[0]["path"] = "docs/private.md"
        self.refused()
    def test_bad_mode(self):
        self.fixture.files[0]["mode"] = "120000"
        self.refused()
    def test_extra_entry_field(self):
        self.fixture.files[0]["url"] = "untrusted"
        self.refused()
    def test_nonbyte_read(self):
        self.fixture.data[self.fixture.files[0]["path"]] = "text"
        self.refused()
    def test_size_mismatch(self):
        self.fixture.files[0]["size"] += 1
        self.refused()
    def test_sha256_mismatch(self):
        self.fixture.files[0]["sha256"] = "0" * 64
        self.refused()
    def test_gitblob_mismatch(self):
        self.fixture.files[0]["git_blob"] = "0" * 40
        self.refused()
    def test_total_mismatch(self):
        self.fixture.report["total_bytes"] += 1
        self.refused()
    def test_file_budget(self):
        self.fixture.files[0]["size"] = exporter.MAX_FILE_BYTES + 1
        self.refused()
    def test_total_budget(self):
        self.fixture.report["total_bytes"] = exporter.MAX_TOTAL_BYTES + 1
        self.refused()
    def test_encoded_budget(self):
        with patch.object(exporter, "MAX_JSON_BYTES", 100):
            self.refused()
    def test_changed_valid_blob_mapping(self):
        # Self-consistent alternate bytes and metadata still cannot alter the pinned mapping.
        row = self.fixture.files[0]
        data = b"substituted-valid-blob"
        self.fixture.report["total_bytes"] += len(data) - row["size"]
        self.fixture.data[row["path"]] = data
        row.update(size=len(data), git_blob=exporter._sha1_blob(data),
                   sha256=hashlib.sha256(data).hexdigest())
        self.refused()
    def test_cli_no_ref_override(self):
        with self.assertRaises(SystemExit):
            exporter.main(["--repository", "fixture", "--ref", "main"])
    def test_loader_failure_no_output(self):
        with patch.object(exporter, "ApprovedMainBaseline", side_effect=BaselineError("secret stderr")):
            with patch("sys.stderr", new_callable=io.StringIO) as error:
                self.assertEqual(exporter.main(["--repository", "fixture"]), 1)
                self.assertNotIn("secret", error.getvalue())

if __name__ == "__main__":
    unittest.main()

