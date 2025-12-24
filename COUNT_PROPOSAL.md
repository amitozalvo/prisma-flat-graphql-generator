# Count Implementation Proposal

## Overview
Add support for `count` queries to enable counting records with optional filters, matching Prisma's `count()` API.

---

## GraphQL Schema Design

### Option 1: Simple Count (Recommended)
```graphql
type Query {
  # Existing queries
  user(where: UserWhereInput, ...): User
  users(where: UserWhereInput, ...): [User!]!

  # New count query
  usersCount(where: UserWhereInput): Int!
}
```

**Usage:**
```graphql
# Count all users
query {
  usersCount
}

# Count with filter
query {
  usersCount(where: {
    role: { equals: ADMIN }
    createdAt: { gte: "2024-01-01" }
  })
}

# Count users with posts
query {
  usersCount(where: {
    posts: { some: { published: true } }
  })
}
```

**Pros:**
- Simple, clean API
- Matches REST convention
- Easy to understand
- Minimal schema changes

**Cons:**
- Can't get detailed counts (per-field counts)

---

### Option 2: Detailed Count Object
```graphql
type UserCountResult {
  _all: Int!
  id: Int!
  email: Int!
  # ... other fields
}

type Query {
  usersCount(where: UserWhereInput): UserCountResult!
}
```

**Usage:**
```graphql
query {
  usersCount(where: { role: ADMIN }) {
    _all
    email
  }
}
```

**Pros:**
- Matches Prisma's count API more closely
- Can get per-field counts (useful for nullable fields)

**Cons:**
- More complex schema
- Most use cases just need total count
- Requires generating count result types

---

### Option 3: Both Simple and Aggregate
```graphql
type Query {
  # Simple count (just the number)
  usersCount(where: UserWhereInput): Int!

  # Detailed aggregate (future)
  usersAggregate(where: UserWhereInput): UserAggregateResult
}

type UserAggregateResult {
  _count: UserCountAggregateOutputType!
  _avg: UserAvgAggregateOutputType
  _sum: UserSumAggregateOutputType
  _min: UserMinAggregateOutputType
  _max: UserMaxAggregateOutputType
}
```

**Pros:**
- Simple count for common use case
- Extensible for future aggregations
- Clear separation of concerns

**Cons:**
- Two different query patterns
- More queries to maintain

---

## Recommended Approach: Option 1 (Simple Count)

### Why?
1. **Simplicity**: Most use cases just need a total count
2. **Performance**: Single integer return is efficient
3. **Familiarity**: Matches common GraphQL patterns
4. **Extensibility**: Can add detailed aggregates later

### Implementation Plan

#### 1. Add to Query Types
For each model, generate:
```graphql
type Query {
  user(where: UserWhereInput, ...): User
  users(where: UserWhereInput, ...): [User!]!
  usersCount(where: UserWhereInput): Int!  # NEW
}
```

#### 2. Naming Convention
- Model: `User` → Query: `usersCount`
- Model: `Post` → Query: `postsCount`
- Model: `BlogPost` → Query: `blogPostsCount`

Use pluralized model name + "Count"

#### 3. Arguments
Only accept `where` filter (no ordering, pagination, etc.):
```graphql
usersCount(where: UserWhereInput): Int!
```

**Why only `where`?**
- Count doesn't need ordering (`orderBy`)
- Count doesn't need pagination (`take`, `skip`, `cursor`)
- Count doesn't need field selection (`distinct`)
- Count doesn't use selection sets (no `buildPrismaSelect` needed)

#### 4. Resolver Implementation
```typescript
// Generated resolver
usersCount: (_parent: any, args: any, context: any, info: any) => {
  return context.prisma.User.count({
    where: args.where
  })
}
```

**Simple!** No need for `buildPrismaSelect` since count returns a scalar.

---

## Code Changes Required

### 1. Update `src/cli/types.ts`
```typescript
export type GraphqlGeneratorOptions = {
  excludeModels?: string[]
  models?: string[]
  excludeInputFields?: string[]
  excludeOutputFields?: string[]
  queries?: string[]  // Add "count" to valid options
  mutations?: string[]
  output?: string
}
```

### 2. Update `src/cli/generate.ts`

#### Add "count" to query types
```typescript
const allQueries = ["findFirst", "findMany", "count"];  // Add count
```

#### Update `getTypeDef()` to handle count
```typescript
const queriesTypeDefs = (options?.queries ?? allQueries).map(query => {
  const inputArgs = getQueryInputArguments(model.name, query, schema, usedInputTypes);

  switch (query) {
    case "findFirst":
      return `${singularName(model.name)}(${inputArgs}): ${model.name}`

    case "findMany":
      return `${pluralName(model.name)}(${inputArgs}): [${model.name}!]!`

    case "count":  // NEW
      // Only use 'where' argument for count
      const whereArg = schema.outputObjectTypes.prisma
        .find((type) => type.name === "Query")
        ?.fields.find((field) => field.name === `findMany${model.name}`)
        ?.args.find((arg) => arg.name === 'where');

      if (whereArg) {
        const whereType = getInputType(whereArg);
        usedInputTypes.add(whereType.type);
        return `${pluralName(model.name)}Count(where: ${whereType.type}): Int!`;
      }
      return `${pluralName(model.name)}Count: Int!`;

    default:
      throw new Error("Unknown query: " + query);
  }
});
```

#### Update `getResolvers()` to handle count
```typescript
const resolvers = (options?.queries ?? allQueries).map(query => {
  switch (query) {
    case "findFirst":
      return `${singularName(model.name)}: (_parent: any, args: any, context: any, info: any) => {
        const prismaSelect = buildPrismaSelect(info, ${model.name.toUpperCase()}_FIELDS);
        return context.prisma.${model.name}.findFirst({ ...args, ...prismaSelect })
      }`

    case "findMany":
      return `${pluralName(model.name)}: (_parent: any, args: any, context: any, info: any) => {
        const prismaSelect = buildPrismaSelect(info, ${model.name.toUpperCase()}_FIELDS);
        return context.prisma.${model.name}.findMany({ ...args, ...prismaSelect })
      }`

    case "count":  // NEW
      return `${pluralName(model.name)}Count: (_parent: any, args: any, context: any) => {
        return context.prisma.${model.name}.count({ where: args.where })
      }`

    default:
      throw new Error("Unknown query: " + query);
  }
});
```

**Note**: Count resolver doesn't need `info` parameter or `buildPrismaSelect` since it returns a scalar.

---

## Configuration

Users can control which queries to generate:

```prisma
generator graphql {
  provider = "prisma-flat-graphql-generator"
  queries  = ["findFirst", "findMany", "count"]  // Enable count
}
```

Or disable count:
```prisma
generator graphql {
  provider = "prisma-flat-graphql-generator"
  queries  = ["findFirst", "findMany"]  // No count
}
```

Default (if not specified): All three enabled.

---

## Examples

### Generated Schema
```graphql
# User type
type User {
  id: Int!
  email: String!
  name: String
  posts: [Post!]!
}

# Queries
type Query {
  user(where: UserWhereInput, ...): User
  users(where: UserWhereInput, ...): [User!]!
  usersCount(where: UserWhereInput): Int!

  post(where: PostWhereInput, ...): Post
  posts(where: PostWhereInput, ...): [Post!]!
  postsCount(where: PostWhereInput): Int!
}
```

### Generated Resolver
```typescript
const resolvers = {
  Query: {
    user: (_parent: any, args: any, context: any, info: any) => {
      const prismaSelect = buildPrismaSelect(info, USER_FIELDS);
      return context.prisma.User.findFirst({ ...args, ...prismaSelect })
    },
    users: (_parent: any, args: any, context: any, info: any) => {
      const prismaSelect = buildPrismaSelect(info, USER_FIELDS);
      return context.prisma.User.findMany({ ...args, ...prismaSelect })
    },
    usersCount: (_parent: any, args: any, context: any) => {
      return context.prisma.User.count({ where: args.where })
    },
  },
}
```

---

## Testing Strategy

### Unit Tests
```typescript
describe('Count Query Generation', () => {
  it('should generate count query in typeDefs', async () => {
    const output = await generate(dmmf, { queries: ['count'] });
    const userModel = output.models.find(m => m.modelName === 'User');

    expect(userModel!.typeDef).toContain('usersCount');
    expect(userModel!.typeDef).toContain('usersCount(where: UserWhereInput): Int!');
  });

  it('should generate count resolver', async () => {
    const output = await generate(dmmf, { queries: ['count'] });
    const userModel = output.models.find(m => m.modelName === 'User');

    expect(userModel!.resolvers).toContain('usersCount:');
    expect(userModel!.resolvers).toContain('context.prisma.User.count');
  });

  it('should only include where argument for count', async () => {
    const output = await generate(dmmf, { queries: ['count'] });
    const userModel = output.models.find(m => m.modelName === 'User');

    expect(userModel!.typeDef).toContain('where: UserWhereInput');
    expect(userModel!.typeDef).not.toContain('orderBy');
    expect(userModel!.typeDef).not.toContain('take');
    expect(userModel!.typeDef).not.toContain('skip');
  });

  it('should respect queries option', async () => {
    const output = await generate(dmmf, { queries: ['findMany'] });
    const userModel = output.models.find(m => m.modelName === 'User');

    expect(userModel!.typeDef).not.toContain('usersCount');
  });
});
```

### Integration Tests
Create a test server and verify:
```typescript
// Test actual count query
const COUNT_QUERY = gql`
  query {
    usersCount(where: { role: ADMIN })
  }
`;

// Should return { usersCount: 5 }
```

---

## Future Enhancements

Once count is working, we can add:

1. **Full Aggregations**
   ```graphql
   usersAggregate(where: UserWhereInput): UserAggregateResult
   ```

2. **GroupBy** (complex, later)
   ```graphql
   usersGroupBy(by: [UserScalarFieldEnum!]!, where: UserWhereInput): [UserGroupByResult!]!
   ```

3. **Relation Counts** (bring back `_count` properly)
   ```graphql
   type User {
     _count: UserCountOutputType
   }
   ```

---

## Migration Path

1. **Phase 1**: Implement simple `count` (this proposal)
2. **Phase 2**: Add aggregate functions (avg, sum, min, max)
3. **Phase 3**: Add groupBy support
4. **Phase 4**: Re-enable `_count` on relations with proper resolvers

---

## Summary

**Recommendation**: Implement Option 1 (Simple Count)

- Query name: `${pluralName}Count`
- Arguments: `where: ${Model}WhereInput` only
- Return type: `Int!`
- Resolver: `context.prisma.${Model}.count({ where: args.where })`
- Configuration: Add to `allQueries` array, controllable via `queries` option

This provides immediate value for the most common use case while keeping the door open for more complex aggregations later.
