# Test Suite

Comprehensive automated tests for the Prisma GraphQL Generator.

## Test Structure

```
tests/
├── fixtures/
│   └── test-schema.prisma      # Test Prisma schema
├── integration/
│   └── generator.test.ts       # End-to-end generator tests
└── unit/
    ├── enum-handling.test.ts   # Prisma 5/7 compatibility tests
    └── exclusions.test.ts      # Field/model exclusion logic tests
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with UI
npm run test:ui

# Run with coverage
npm run test:coverage
```

## Test Coverage

### Integration Tests (18 tests)

**Basic Generation:**
- ✅ Generates GraphQL schema and resolvers
- ✅ Generates files for all models
- ✅ Generates typeDefs and resolvers for each model

**Model Exclusions:**
- ✅ Excludes models specified in `excludeModels`
- ✅ Excludes multiple models

**Field Exclusions:**
- ✅ Excludes fields from output (typeDefs)
- ✅ Excludes fields from input filters (WhereInput, OrderBy)
- ✅ Excludes multiple fields

**Enum Generation:**
- ✅ Generates enums in inputTypes
- ✅ Handles Prisma 7 enum format (backward compatible)

**Relations:**
- ✅ Generates relations in typeDefs
- ✅ Includes filter arguments for relations

**Query Types:**
- ✅ Generates findFirst and findMany queries
- ✅ Includes standard query arguments (where, orderBy, cursor, take, skip)

**Index File:**
- ✅ Generates valid index file with exports
- ✅ Imports all generated models

**Code Quality:**
- ✅ Generates valid GraphQL syntax
- ✅ Generates valid TypeScript syntax

### Unit Tests (8 tests)

**Enum Handling (Prisma 5 vs 7):**
- ✅ Handles Prisma 5 format (values as strings)
- ✅ Handles Prisma 7 format (data with key/value)
- ✅ Handles mixed scenarios gracefully
- ✅ Backwards compatible with both formats

**Exclusion Logic:**
- ✅ Filters fields from lists
- ✅ Case-sensitive exclusions
- ✅ Handles empty exclusion lists
- ✅ Filters models from lists

## Test Results

```
Test Files  3 passed (3)
Tests       26 passed (26)
Duration    ~600ms
```

## What's Tested

### Generator Functionality
- Schema generation from Prisma DMMF
- TypeDef generation (GraphQL types)
- Resolver generation (query handlers)
- Index file generation (exports)

### Exclusion Features
- `excludeModels` - Skip entire models
- `excludeOutputFields` - Hide fields from GraphQL types
- `excludeInputFields` - Hide fields from filter inputs

### Prisma 7 Compatibility
- Enum format changes (values → data)
- Optional chaining for potentially undefined schema properties
- Backward compatibility with Prisma 5

### Edge Cases
- Empty enums
- Missing optional fields
- Deeply nested input types
- Aggregate output types

## CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run tests
  run: npm test

- name: Check coverage
  run: npm run test:coverage
```

## Future Test Additions

- [ ] Mutation generation (when implemented)
- [ ] Custom query types configuration
- [ ] PrismaSelect middleware integration
- [ ] Performance benchmarks
- [ ] Snapshot tests for generated output
