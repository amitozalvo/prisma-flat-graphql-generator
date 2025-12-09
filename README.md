## Overview
`prisma-flat-graphql-generator` is a prisma generator designed to automatically generate GraphQL schema and resolvers from a Prisma schema. This tool streamlines the process of setting up a GraphQL server by creating a comprehensive structure of resolvers, type definitions, and input types based on your Prisma models.

**Key Features:**
- ✅ **Zero Dependencies**: Generated code has no external runtime dependencies beyond Prisma Client and GraphQL
- ✅ **N+1 Prevention**: Built-in query optimization automatically prevents N+1 issues
- ✅ **Standalone**: No need for @paljs/plugins or graphql-type-json - everything is self-contained
- ✅ **Type Safe**: Full TypeScript support with generated types

## Installation
To install, run:
```bash
npm install prisma-flat-graphql-generator
```

**That's it!** No additional dependencies required. The generated code is completely standalone.

In your Prisma schema file, add the following generator clause:
```prisma
generator graphql {
    provider = "prisma-flat-graphql-generator"
    output   = "./generated/graphql"  // Optional: specify output directory
}
```

## Usage

### 1. Generate GraphQL Schema and Resolvers
Run Prisma generate:
```bash
npx prisma generate
```

### 2. Use with Apollo Server
The generated code works directly with Apollo Server - no middleware or wrapping needed:

```typescript
import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { PrismaClient } from '@prisma/client';
import { typeDefs, resolvers } from './generated/graphql';

const prisma = new PrismaClient();

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const { url } = await startStandaloneServer(server, {
  context: async () => ({ prisma }),
  listen: { port: 4000 },
});

console.log(`🚀 Server ready at ${url}`);
```

That's it! The resolvers automatically optimize queries to prevent N+1 issues.

## Example
For models `User` and `Post`:
```graphql
query GetUserWithPosts($userId: String!) {
  user(where: { id: { equals: $userId } }) { 
    id
    displayName
    photoURL
    posts {
      id
      text
    }
  }
}

query GetAllUsers { 
  users {
    id
    displayName
    photoURL
  }
}
```

## Generator Configurations
You can customize the generator output with the following configurations:

- `models`               Specify models to generate typeDefs and resolvers for.
- `excludeModels`        Exclude specific models from generating typeDefs and resolvers.
- `excludeInputFields`   Exclude fields from filtering in GraphQL queries.
- `excludeOutputFields`  Exclude fields from GraphQL outputs.
- `output`               Set a custom output directory for the generator (Defaults to the same directory as schema.prisma file).

## Testing

This library has comprehensive test coverage to ensure reliability:

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode for development
npm run test:coverage # Generate coverage report
```

**Test Suite:**
- 49 passing tests across unit and integration tests
- Tests cover: generation, exclusions, enums, bug fixes, and edge cases
- Recent bug fixes verified with dedicated test coverage

**Recent Improvements (v0.1.13):**
- ✅ Fixed duplicate type definitions in generated GraphQL schemas
- ✅ Fixed GraphQL formatting to ensure consistent output
- ✅ Fixed nested relation handling to support deep query optimization
- ✅ Added 19 new tests specifically for bug fixes

See [CHANGELOG.md](./CHANGELOG.md) for detailed release notes.

## Acknowledgments
This library was inspired by Ahmed Elywa's work on paljs.

## Limitations
Currently, this generator does not support mutations such as create, update, or delete.

## Contributing
Contributions are welcome to extend the functionality, including support for mutations and more.

See [CLAUDE.md](./CLAUDE.md) for development guidelines and architecture details.
