from .router import mcp
def main():
    mcp.run()
# Optionally expose other important items at package level
__all__ = ["main"]