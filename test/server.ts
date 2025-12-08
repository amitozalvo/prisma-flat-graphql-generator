import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { PrismaClient } from "./generated/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { typeDefs, resolvers } from "./generated/graphql";

const adapter = new PrismaBetterSqlite3({
  // use the same URL as in prisma.config.ts
  url: "file:./test.db",
});

const prisma = new PrismaClient({ adapter });

// Create Apollo Server - no wrapping needed!
// Generated resolvers include buildPrismaSelect optimization
const server = new ApolloServer({
  typeDefs,
  resolvers,
});

// Start server
async function startServer() {
  const { url } = await startStandaloneServer(server, {
    context: async () => ({ prisma }),
    listen: { port: 4000 },
  });

  console.log(`🚀 Server ready at ${url}`);
  console.log(`📝 Try queries like:

  query GetUsers {
    users {
      id
      email
      name
      createdAt
      posts {
        id
        title
        published
      }
    }
  }
  `);
}

startServer().catch(console.error);
