"""Git checkpoint before writes."""

import os
import subprocess
import datetime


def ensure_checkpoint(project_dir: str):
    """Create a git checkpoint before modifying project files."""
    git_dir = os.path.join(project_dir, ".git")

    if not os.path.isdir(git_dir):
        # Initialize git repo
        subprocess.run(["git", "init"], cwd=project_dir, capture_output=True)
        subprocess.run(["git", "add", "-A"], cwd=project_dir, capture_output=True)
        subprocess.run(["git", "commit", "-m", "Initial Myika checkpoint"], cwd=project_dir, capture_output=True)

    # Check if there are changes to checkpoint
    status = subprocess.run(["git", "status", "--porcelain"], cwd=project_dir, capture_output=True, text=True)
    if status.stdout.strip():
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        branch_name = f"myika/auto-{timestamp}"
        subprocess.run(["git", "checkout", "-b", branch_name], cwd=project_dir, capture_output=True)
        subprocess.run(["git", "add", "-A"], cwd=project_dir, capture_output=True)
        subprocess.run(["git", "commit", "-m", f"Myika auto-checkpoint {timestamp}"], cwd=project_dir, capture_output=True)
        subprocess.run(["git", "checkout", "-"], cwd=project_dir, capture_output=True)
