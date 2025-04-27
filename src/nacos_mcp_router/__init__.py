import logging

from .router import mcp
def main():
    logger = logging.getLogger()
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    mcp.run()
if __name__ == "__main__":
    main()
