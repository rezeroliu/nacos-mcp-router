import { Router } from "../../src/router";
import { mockMcpServers, searchTestCases } from "../fixtures/searchTestData";

/**
 * Dummy McpManager that only implements the two methods used by Router.searchNacosMcpServer.
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
class DummyMcpManager {
  /**
   * Return servers whose name or description includes the keyword (case-insensitive).
   */
  async searchMcpByKeyword(keyword: string) {
    const kw = keyword.toLowerCase();
    return mockMcpServers.filter(
      s => s.name.toLowerCase().includes(kw) || s.description.toLowerCase().includes(kw)
    );
  }

  /**
   * Simple fallback that returns up to `count` servers from the mock list.
   */
  async getMcpServer(_taskDescription: string, count: number) {
    return mockMcpServers.slice(0, count);
  }
}

// Minimal Router configuration – values are irrelevant for the tested method
const dummyConfig = {
  nacos: {
    serverAddr: "dummy-addr",
    username: "dummy-user",
    password: "dummy-pass"
  },
  mcp: {
    host: "",
    port: 0
  }
} as any;

describe("Router.searchNacosMcpServer", () => {
  const router = new Router(dummyConfig);
  // Inject dummy manager – Router will not initialise it until start() is called, so we override
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  router.mcpManager = new DummyMcpManager();

  it.each(searchTestCases)("%s", async testCase => {
    const { taskDescription, keyWords } = testCase.input;
    const { minResults, expectedKeywords, descriptionShouldContain } = testCase.expected;

    // Router method requires at least one keyword – cast to the required tuple type
    const results = await router.searchNacosMcpServer(
      taskDescription,
      keyWords as [string, ...string[]]
    );

    // Minimum result count
    expect(results.length).toBeGreaterThanOrEqual(minResults);

    // Expected keywords contained in server names
    if (expectedKeywords) {
      expectedKeywords.forEach(k => {
        const has = results.some(r => r.name.includes(k));
        expect(has).toBe(true);
      });
    }

    // Expected substrings in description
    if (descriptionShouldContain) {
      descriptionShouldContain.forEach(substr => {
        const has = results.some(r => r.description.includes(substr));
        expect(has).toBe(true);
      });
    }
  });
});
