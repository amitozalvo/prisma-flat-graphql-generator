# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

`prisma-flat-graphql-generator` is a Prisma generator that automatically generates GraphQL schema (type definitions) and resolvers from a Prisma schema. The generator is designed to solve N+1 query problems by using `@paljs/plugins` PrismaSelect middleware to flatten GraphQL queries into optimized single Prisma queries.

**Key Features:**
- Auto-generates GraphQL type definitions and resolvers from Prisma models
- Produces "flat" queries that avoid N+1 performance issues
- Supports field-level and model-level exclusions for multi-tenant scenarios
- Query-only (no mutations) - intended for read-heavy use cases
- Outputs organized per-model directory structure

**Use Case:**
This generator was created as a replacement for `@paljs/nexus` in the Simbly backend (`../backend/`), providing better type safety and control over generated GraphQL schemas, particularly for multi-tenant applications where certain fields (like `tenantId`) should be excluded from the GraphQL API.

## Build and Development Commands

```bash
# Install dependencies
npm install

# Build the generator (compile TypeScript to dist/)
npm run build

# Test the generator on the example schema
npx prisma generate --schema=prisma/schema.prisma
```

After running `npx prisma generate`, check the `./graphql/` directory (or custom output path) for generated files.

## Architecture

### Generator Flow

1. **Entry Point**: `src/generator.ts` → delegates to `src/cli/generator.ts`
2. **Prisma Hook**: `generatorHandler` from `@prisma/generator-helper` registers two hooks:
   - `onManifest()`: Returns generator metadata (name, version, default output)
   - `onGenerate(options)`: Main generation logic triggered by `npx prisma generate`

3. **Generation Pipeline** (`src/cli/generate.ts`):
   ```
   generate(dmmf, options)
     ↓
   For each Prisma model:
     - generateModelResolversAndTypeDef()
     - Generates typeDef (GraphQL schema)
     - Generates resolvers (query handlers)
     - Tracks used input types
     ↓
   getInputTypes()
     - Generates GraphQL input types for filters/args
     - Handles exclusions (excludeInputFields/excludeOutputFields)
     ↓
   formatModelsOutput() + formatTypescript()
     - Prettier formatting for TypeScript and GraphQL
     ↓
   generateIndexFile()
     - Combines all models into single export
   ```

4. **Output Writing** (`src/cli/writeGenerateOutput.ts`):
   ```
   graphql/
     ├── index.ts              (exports all typeDefs and resolvers)
     ├── InputTypes.ts         (shared input types: filters, enums, etc.)
     ├── User/
     │   ├── typeDefs.ts       (GraphQL type definition for User)
     │   └── resolvers.ts      (Query resolvers: user, users)
     └── Post/
         ├── typeDefs.ts
         └── resolvers.ts
   ```

### Key Concepts

**DMMF (Data Model Meta Format):**
- Prisma's internal representation of the schema
- Accessed via `options.dmmf` in generator
- Contains: `datamodel` (models, fields, relations), `schema` (input types, output types)

**Used Input Types Tracking:**
- `usedInputTypes` Set tracks which Prisma input types are actually needed
- Prevents generating unused filter types (e.g., if a model is excluded)
- Recursively traverses input type dependencies

**Field Exclusions:**
- `excludeInputFields`: Remove fields from filter arguments (e.g., `tenantId` to prevent querying by it)
- `excludeOutputFields`: Remove fields from GraphQL type outputs (e.g., hide `tenantId` in responses)
- Common use case: Multi-tenant apps where `tenantId` is set by auth context, not by client

**Query Types:**
- Currently only generates `findFirst` and `findMany` queries (hardcoded in `allQueries`)
- Future: `queries` option can be used to customize this (see `GraphqlGeneratorOptions.queries`)

### Generator Configuration

In `schema.prisma`:

```prisma
generator graphql {
  provider            = "prisma-flat-graphql-generator"
  output              = "./graphql"              // Optional: custom output path
  models              = ["User", "Post"]         // Optional: only generate these models
  excludeModels       = ["Tenant"]               // Optional: exclude these models
  excludeInputFields  = ["tenantId", "tenant"]   // Hide from filter args
  excludeOutputFields = ["tenantId", "tenant"]   // Hide from type outputs
}
```

## Testing the Generator

The `prisma/schema.prisma` file contains a test schema with:
- Multi-tenant models (composite primary keys: `[tenantId, id]`)
- Relations (User ↔ Post, both linked to Tenant)
- Field exclusions configured in the generator block

**Testing workflow:**
1. Make changes to generator code in `src/cli/`
2. Run `npm run build` to compile
3. Run `npx prisma generate` to execute generator
4. Inspect output in `./graphql/` directory
5. Verify:
   - Excluded models don't appear
   - Excluded fields are removed from inputs and outputs
   - Input types are properly nested and formatted
   - Resolvers include proper typing

## Integration with GraphQL Server

Generated code is intended to be used with `@paljs/plugins` middleware:

```typescript
import { makeExecutableSchema } from "@graphql-tools/schema";
import { PrismaSelect } from '@paljs/plugins';
import { applyMiddleware } from 'graphql-middleware';
import { typeDefs, resolvers } from './graphql'; // Generated output

const middleware = async (resolve, root, args, context, info) => {
    const result = new PrismaSelect(info).value;
    if (Object.keys(result.select).length > 0) {
        args = { ...args, ...result };
    }
    return resolve(root, args, context, info);
};

const schema = applyMiddleware(
    makeExecutableSchema({ typeDefs, resolvers }),
    middleware
);
```

**How PrismaSelect Avoids N+1:**
- Analyzes GraphQL query selection set
- Converts to Prisma `select`/`include` syntax
- Injects as args to resolver
- Resolver passes through to Prisma client
- Result: Single optimized query with JOINs instead of multiple queries

## Current Limitations

1. **No Mutations**: Only generates queries (`findFirst`, `findMany`). Create/update/delete not supported.
2. **No Aggregations**: Count, sum, avg, etc. not generated.
3. **No Subscriptions**: Real-time GraphQL subscriptions not supported.
4. **Hardcoded Query List**: `allQueries = ["findFirst", "findMany"]` is hardcoded; `queries` option not yet implemented.

## Code Organization

- `src/generator.ts` - Entry point (shebang for CLI execution)
- `src/cli/generator.ts` - Prisma generator handler registration
- `src/cli/generate.ts` - Core generation logic (300+ lines)
- `src/cli/writeGenerateOutput.ts` - File system output writer
- `src/cli/types.ts` - TypeScript type definitions for generator
- `src/cli/constants.ts` - File name constants (`typeDefs.ts`, `resolvers.ts`, etc.)

## Debugging Tips

- **Generator not running?** Check `schema.prisma` generator block has correct `provider` path
- **Missing types in output?** Check `usedInputTypes` logic - may be pruning needed types
- **Fields still appearing despite exclusion?** Verify exact field name match in `excludeInputFields`/`excludeOutputFields`
- **Output not formatted?** Ensure Prettier is installed as dependency

## Relationship to Simbly Codebase

This generator is referenced in `../CLAUDE.md` as the intended replacement for `@paljs/nexus` in the Simbly backend. However, it is **not yet integrated** into the backend. When integration happens:

1. Backend's `schema.prisma` will add this generator
2. `backend/src/graphql/types/` Nexus definitions will be replaced with generated files
3. Multi-tenant field exclusions will be configured via `excludeInputFields`/`excludeOutputFields`
4. Migration must preserve exact GraphQL schema to avoid breaking frontend
