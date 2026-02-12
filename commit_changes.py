#!/usr/bin/env python3
"""Quick script to commit and push README changes"""
import subprocess
import sys

def run_cmd(cmd):
    """Run a shell command and return output"""
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return result.returncode, result.stdout, result.stderr

print("=" * 80)
print("Committing README Updates")
print("=" * 80)

# Add files
print("\n[1/3] Staging files...")
code, out, err = run_cmd("git add README.md backend/app/api/chat.py backend/tests/test_new_features.py manual_test.py")
if code != 0:
    print(f"Error staging: {err}")

# Check status
print("\n[2/3] Checking status...")
code, out, err = run_cmd("git status --short")
print(out)

# Commit
print("\n[3/3] Committing...")
commit_msg = """docs: Update README with production improvements and fix pagination

- Add 'Recent Production-Ready Improvements' section at top
- Update Features: Cloudinary in voice, pagination in workflow
- Update Tech Stack: Add Cloudinary, emphasize httpOnly cookies
- Update Security: Comprehensive httpOnly details + dual auth
- Update Design Decisions: httpOnly rationale + pagination + Cloudinary
- Update Future: Remove completed features (pagination, CDN)
- Fix chat.py: Add limit and cursor parameters to get_messages
- Add test_new_features.py: 11 tests for new features
- Add manual_test.py: Verification script

Addresses security (XSS), persistence, and scalability."""

code, out, err = run_cmd(f'git commit -m "{commit_msg}"')
print(out)
if err:
    print(err)

# Push
print("\n[4/3] Pushing to origin...")
code, out, err = run_cmd("git push origin main")
print(out)
if err:
    print(err)

print("\n" + "=" * 80)
print("Complete!")
print("=" * 80)
