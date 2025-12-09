# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

#### Bug #1: Duplicate Type Definitions
- **Issue**: GraphQL input types (e.g., `UserWhereInput`, `PostWhereInput`) were generated multiple times in `inputTypes.ts`, causing invalid GraphQL schemas
- **Root Cause**: The iterative dependency resolution loop called `addInputObjectTypesToFileContent()` multiple times without tracking which types were already written
- **Fix**: Introduced `writtenTypes` Set to track already-written types and skip duplicates
- **Impact**: Generated GraphQL schemas are now valid and don't have duplicate type definitions
- **Files Changed**: `src/cli/generate.ts`
- **Tests Added**: 6 tests in `tests/unit/bug-fixes.test.ts` covering duplicates in inputs, enums, aggregates, and circular references

#### Bug #2: GraphQL Formatting Not Applied
- **Issue**: Generated GraphQL had inconsistent formatting and indentation because `formatGraphql()` returned a Promise without awaiting it
- **Root Cause**: `formatGraphql()` called Prettier's `format()` (which returns a Promise) but immediately returned the unformatted content
- **Fix**:
  - Made `formatGraphql()` async with proper `await`
  - Made all calling functions async: `getInputTypes()`, `getTypeDef()`, `generateModelResolversAndTypeDef()`
  - Updated `generate()` to use `Promise.all()` for parallel model generation
- **Impact**: Generated GraphQL now has consistent, proper formatting
- **Files Changed**: `src/cli/generate.ts`
- **Tests Added**: 4 tests in `tests/unit/bug-fixes.test.ts` verifying proper indentation and formatting

#### Bug #3: Incomplete Nested Relation Handling
- **Issue**: The `buildNestedSelect()` function only handled one level of nesting, breaking deep queries like `user -> posts -> comments -> author`
- **Root Cause**: `buildNestedSelect()` set all fields to `true` without checking if they had nested selections
- **Fix**: Made `buildNestedSelect()` recursive:
  - Check if selection has `selectionSet` (indicates nested relation)
  - Recursively call `buildNestedSelect()` for nested fields
  - Set scalar fields to `true`, relation fields to recursive result
- **Impact**: N+1 prevention now works correctly for arbitrarily deep query nesting
- **Files Changed**: `src/cli/generate.ts`
- **Tests Added**: 6 tests in `tests/unit/bug-fixes.test.ts` verifying recursive behavior and proper handling

### Tests
- Added 19 comprehensive tests in `tests/unit/bug-fixes.test.ts`
- All existing 30 tests continue to pass
- Total test count: 49 tests passing

## [0.1.12] - 2025-01-XX

### Changed
- Removed `graphql-type-json` dependency (moved to inline implementation)
- Package is now completely standalone with zero external runtime dependencies

## [0.1.11] - Previous Release

Initial published version with basic generator functionality.

---

## Notes for Contributors

When adding entries to this changelog:
- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- Prefix breaking changes with `**BREAKING:**`
- Reference issue numbers when applicable
- Group changes by type: Added, Changed, Deprecated, Removed, Fixed, Security
