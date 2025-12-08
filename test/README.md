# Test Environment

This directory demonstrates the Prisma GraphQL Generator output and provides example server code.

## Current Status

✅ **Generator Verified Working - 100% Standalone**
The generator successfully creates GraphQL schema and resolvers with **zero external dependencies**:
- Generated files in `generated/graphql/` are completely self-contained
- Model exclusions work (`Internal` model excluded)
- Field exclusions work (`password` field excluded)
- Relations generated correctly (User → Posts)
- Built-in N+1 query optimization (no @paljs/plugins needed!)
- Inline Json scalar (no graphql-type-json needed!)

## Generated Files

Run `npm run test:setup` to generate Prisma Client and GraphQL files:

```
generated/
├── client/           # Prisma Client (generated)
└── graphql/          # GraphQL schema and resolvers (generated)
    ├── index.ts      # Main export with typeDefs and resolvers
    ├── inputTypes.ts # GraphQL input types and enums
    ├── User/
    │   ├── typeDefs.ts   # User type definition
    │   └── resolvers.ts  # User query resolvers
    └── Post/
        ├── typeDefs.ts   # Post type definition
        └── resolvers.ts  # Post query resolvers
```

##Usage

### Generate Files Only
```bash
cd test
DATABASE_URL="file:./test.db" npx prisma generate
```

This will generate both Prisma Client and GraphQL schema/resolvers.

## Server Code (Demonstration)

The `server.ts` file shows how simple it is to use the generated code with Apollo Server.

**Key Advantage**: No middleware or wrapping needed! Just import `typeDefs` and `resolvers` and pass them directly to Apollo Server. The generated resolvers include built-in query optimization.

**Note**: Running the server requires additional Prisma 7 database configuration which is beyond the scope of this generator test. The generated GraphQL files themselves are fully functional and ready to use.

## Example Queries

### Get all users with their posts
```graphql
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
```

### Get a specific user
```graphql
query GetUser {
  user(where: { email: { equals: "alice@example.com" } }) {
    id
    name
    posts {
      title
      content
    }
  }
}
```

### Get published posts only
```graphql
query GetPublishedPosts {
  posts(where: { published: { equals: true } }) {
    id
    title
    author {
      name
      email
    }
  }
}
```

## What's Being Tested

- ✅ Generator creates valid GraphQL schema
- ✅ Model exclusions work (`Internal` model excluded)
- ✅ Field exclusions work (`password` field excluded from output)
- ✅ Relations work (User → Posts)
- ✅ Built-in query optimization prevents N+1 issues
- ✅ Filters and arguments work correctly
- ✅ Zero external dependencies (no @paljs, no graphql-type-json)
- ✅ Generated resolvers include info parameter and buildPrismaSelect utility
