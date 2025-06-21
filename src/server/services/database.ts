import neo4j from "neo4j";

class DatabaseService {
  private driver: any;
  private database: string;

  constructor() {
    this.database = "neo4j";
    this.connect();
  }

  private async connect() {
    const uri = Deno.env.get("NEO4J_URI")!;
    const username = Deno.env.get("NEO4J_USERNAME")!;
    const password = Deno.env.get("NEO4J_PASSWORD")!;

    const authToken = neo4j.auth.basic(username, password);
    this.driver = neo4j.driver(uri, authToken);
    
    try {
      await this.driver.verifyConnectivity();
      console.log("✅ Connected to Neo4j");
    } catch (error) {
      console.error("❌ Neo4j connection failed:", error);
    }
  }

  async run(query: string, parameters?: Record<string, any>) {
    const session = this.driver.session({ database: this.database });
    try {
      const result = await session.run(query, parameters);
      return result.records.map((record: any) => record.toObject());
    } finally {
      await session.close();
    }
  }

  async close() {
    await this.driver.close();
  }
}

export const db = new DatabaseService();