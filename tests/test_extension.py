import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
EXT = ROOT / 'extension'

class TestExtensionIntegrity(unittest.TestCase):
    def test_manifest_validity(self):
        manifest_path = EXT / 'manifest.json'
        self.assertTrue(manifest_path.exists(), "manifest.json must exist")
        data = json.loads(manifest_path.read_text(encoding='utf-8'))

        self.assertEqual(data.get('manifest_version'), 3)
        self.assertEqual(data.get('author'), 'Soahim Rahman Tasin')
        self.assertIn('alarms', data.get('permissions', []))
        self.assertIn('https://raw.githubusercontent.com/soahimrahman/StreamCatch/*', data.get('host_permissions', []))

        # Check background script exists
        bg = EXT / data['background']['service_worker']
        self.assertTrue(bg.exists(), "background.js must exist")

        # Check icons exist
        for size, rel in data.get('icons', {}).items():
            self.assertTrue((EXT / rel).exists(), f"Icon {size} must exist at {rel}")

    def test_package_metadata(self):
        pkg_path = ROOT / 'package.json'
        self.assertTrue(pkg_path.exists(), "package.json must exist")
        pkg = json.loads(pkg_path.read_text(encoding='utf-8'))

        author = pkg.get('author')
        self.assertIsInstance(author, dict)
        self.assertEqual(author.get('name'), 'Soahim Rahman Tasin')
        self.assertEqual(author.get('url'), 'https://www.facebook.com/soahim.rahman.tasin17/')

        funding = pkg.get('funding')
        self.assertIsInstance(funding, dict)
        self.assertEqual(funding.get('url'), 'https://www.supportkori.com/soahimrahmantasin17')

    def test_ui_files_exist_and_contain_credits(self):
        for filename in ['popup.html', 'dashboard.html', 'sidepanel.html']:
            path = EXT / filename
            self.assertTrue(path.exists(), f"{filename} must exist")
            content = path.read_text(encoding='utf-8')
            self.assertIn('Soahim Rahman Tasin', content, f"{filename} should credit Soahim Rahman Tasin")
            self.assertIn('supportkori.com/soahimrahmantasin17', content, f"{filename} should contain donation link")
            self.assertIn('updateReloadBtn', content, f"{filename} should contain reload update button")

if __name__ == '__main__':
    unittest.main()
