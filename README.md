## Overview
`prisma-flat-graphql-generator` is a prisma generator designed to automatically generate GraphQL schema and resolvers from a Prisma schema. This tool streamlines the process of setting up a GraphQL server by creating a comprehensive structure of resolvers, type definitions, and input types based on your Prisma models.
The resolvers are created in such a way that any graphql query will result in a single prisma query to avoid N+1 issues.

## Installation
To install, run
```npm install prisma-flat-graphql-generator```

You will also need to install:
`@paljs/plugins` flattens the graphql query into a prisma select format, avoiding N+1 issues.
`graphql-type-json` used by the generated code.

In your Prisma schema file, add the following generator clause:
```prisma
generator graphql { 
    provider = "prisma-flat-graphql-generator"
}
```

## Usage
- First, run prisma generate to run the generator: `npx prisma generate`

- Create a file that will hold the schema:
```typescript
import { makeExecutableSchema } from "@graphql-tools/schema";
import { PrismaSelect } from '@paljs/plugins';
import { applyMiddleware } from 'graphql-middleware';
import { typeDefs, resolvers } from './Types';

const middleware = async (resolve: any, root: any, args: any, context: any, info: any) => {
    const result = new PrismaSelect(info).value;
    if (Object.keys(result.select).length > 0) {
        args = {
            ...args,
            ...result,
        };
    }
    return resolve(root, args, context, info);
};

const schema = applyMiddleware(makeExecutableSchema({ typeDefs, resolvers }), middleware);

export default schema;
```

You can now use the schema with Apollo Server or any other graphql server:

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

## Acknowledgments
This library was inspired by Ahmed Elywa's work on paljs.

## Limitations
Currently, this generator does not support mutations such as create, update, or delete.

## Contributing
Contributions are welcome to extend the functionality, including support for mutations and more.
