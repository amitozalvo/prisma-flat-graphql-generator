import { describe, it, expect, beforeAll } from 'vitest';
import { getDMMF } from '@prisma/internals';
import * as fs from 'fs/promises';
import * as path from 'path';
import generate from '../../src/cli/generate';
import { GraphqlGeneratorOptions } from '../../src/cli/types';

describe('Bug Fixes', () => {
  let dmmf: any;
  const testSchemaPath = path.join(__dirname, '../fixtures/test-schema.prisma');

  beforeAll(async () => {
    const schema = await fs.readFile(testSchemaPath, 'utf-8');
    dmmf = await getDMMF({ datamodel: schema });
  });

  describe('Bug #1: Duplicate Type Definitions', () => {
    it('should not generate duplicate UserWhereInput definitions', async () => {
      const output = await generate(dmmf);

      // Count occurrences of "input UserWhereInput"
      const matches = output.inputTypes.match(/input UserWhereInput \{/g);
      const count = matches ? matches.length : 0;

      expect(count).toBe(1); // Should appear exactly once
    });

    it('should not generate duplicate PostWhereInput definitions', async () => {
      const output = await generate(dmmf);

      const matches = output.inputTypes.match(/input PostWhereInput \{/g);
      const count = matches ? matches.length : 0;

      expect(count).toBe(1);
    });

    it('should not generate duplicate enum definitions', async () => {
      const output = await generate(dmmf);

      // Check SortOrder enum (commonly used, could be duplicated)
      const matches = output.inputTypes.match(/enum SortOrder \{/g);
      const count = matches ? matches.length : 0;

      expect(count).toBe(1);
    });

    it('should not generate duplicate aggregate type definitions', async () => {
      const output = await generate(dmmf);

      // Check UserCountAggregateOutputType
      const matches = output.inputTypes.match(/type UserCountAggregateOutputType \{/g);
      const count = matches ? matches.length : 0;

      expect(count).toBe(1);
    });

    it('should handle circular references without duplicates', async () => {
      const output = await generate(dmmf);

      // UserWhereInput references PostWhereInput which references UserWhereInput
      // Both should appear exactly once
      const userMatches = output.inputTypes.match(/input UserWhereInput \{/g);
      const postMatches = output.inputTypes.match(/input PostWhereInput \{/g);

      expect(userMatches?.length).toBe(1);
      expect(postMatches?.length).toBe(1);
    });

    it('should not have duplicate nested filter types', async () => {
      const output = await generate(dmmf);

      // NestedIntFilter is used by multiple types
      const matches = output.inputTypes.match(/input NestedIntFilter \{/g);
      const count = matches ? matches.length : 0;

      expect(count).toBe(1);
    });
  });

  describe('Bug #2: GraphQL Formatting', () => {
    it('should properly format GraphQL in inputTypes', async () => {
      const output = await generate(dmmf);

      // Check for consistent indentation (2 spaces)
      const lines = output.inputTypes.split('\n');
      const inputLine = lines.find(l => l.includes('input UserWhereInput {'));
      const fieldLine = lines[lines.indexOf(inputLine!) + 1];

      // Field should be indented
      expect(fieldLine).toMatch(/^\s+\w+:/);
    });

    it('should format enums consistently', async () => {
      const output = await generate(dmmf);

      // Enum values should be on separate lines
      expect(output.inputTypes).toContain('enum SortOrder {');

      // Check that enum values are properly formatted
      const sortOrderSection = output.inputTypes.match(/enum SortOrder \{[^}]+\}/s);
      expect(sortOrderSection).toBeDefined();
      expect(sortOrderSection![0]).toContain('asc');
      expect(sortOrderSection![0]).toContain('desc');
    });

    it('should format typeDefs with proper indentation', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');

      // Check for GraphQL template literal formatting
      expect(userModel!.typeDef).toContain('type User {');
      expect(userModel!.typeDef).toContain('type Query {');

      // Should have proper field formatting
      const lines = userModel!.typeDef.split('\n');
      const userTypeLine = lines.findIndex(l => l.includes('type User {'));
      const firstFieldLine = lines[userTypeLine + 1];

      // Field should be indented
      expect(firstFieldLine).toMatch(/\s+\w+:/);
    });

    it('should not have malformed GraphQL syntax', async () => {
      const output = await generate(dmmf);

      // Should not have malformed patterns like triple spaces or tabs at start
      expect(output.inputTypes).not.toContain('   type'); // 3+ spaces
      expect(output.inputTypes).not.toContain('\ttype'); // tabs
      expect(output.inputTypes).not.toContain('type{'); // missing space

      // Check that GraphQL is valid (types should have opening brace)
      expect(output.inputTypes).toMatch(/type \w+ \{/);
      expect(output.inputTypes).toMatch(/input \w+ \{/);
      expect(output.inputTypes).toMatch(/enum \w+ \{/);
    });
  });

  describe('Bug #3: Nested Relation Handling', () => {
    it('should generate recursive buildNestedSelect function', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');

      // Should contain recursive call to buildNestedSelect
      expect(userModel!.resolvers).toContain('buildNestedSelect(selection.selectionSet)');
    });

    it('should check for selectionSet to detect nested relations', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');

      // Should check if selection has selectionSet
      expect(userModel!.resolvers).toContain('if (selection.selectionSet)');
      expect(userModel!.resolvers).toContain('select[fieldName] = buildNestedSelect(selection.selectionSet)');
    });

    it('should handle scalar fields differently from relations', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');

      // Should set scalar fields to true
      expect(userModel!.resolvers).toContain('// Scalar field');
      expect(userModel!.resolvers).toContain('select[fieldName] = true');
    });

    it('should return { select } for nested objects', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');

      // buildNestedSelect should return proper select structure
      expect(userModel!.resolvers).toContain('return Object.keys(select).length > 0 ? { select } : true');
    });

    it('should have buildNestedSelect available in all model resolvers', async () => {
      const output = await generate(dmmf);

      // Every model with relations should have buildNestedSelect
      output.models.forEach(model => {
        expect(model.resolvers).toContain('function buildNestedSelect');
      });
    });

    it('should not have the old non-recursive implementation', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');

      // Old implementation just set everything to `true` without checking selectionSet
      // New implementation checks for selectionSet and recurses

      // Extract the entire buildNestedSelect function (match until the next 'const' or end)
      const functionMatch = userModel!.resolvers.match(/function buildNestedSelect\([\s\S]*?\n\}/);
      expect(functionMatch).toBeDefined();

      const functionBody = functionMatch![0];

      // Should check for selection.selectionSet (nested relations)
      expect(functionBody).toContain('selection.selectionSet');

      // Should recursively call buildNestedSelect
      expect(functionBody).toContain('buildNestedSelect(selection.selectionSet)');
    });
  });

  describe('Regression Tests', () => {
    it('should not break existing field exclusion functionality', async () => {
      const options: GraphqlGeneratorOptions = {
        excludeInputFields: ['password'],
        excludeOutputFields: ['password'],
      };

      const output = await generate(dmmf, options);
      const userModel = output.models.find(m => m.modelName === 'User');

      // Password should be excluded from output
      expect(userModel!.typeDef).not.toContain('password:');

      // Password should be excluded from where input
      const whereInputMatch = output.inputTypes.match(/input UserWhereInput \{([^}]+)\}/s);
      expect(whereInputMatch).toBeDefined();
      expect(whereInputMatch![1]).not.toContain('password');
    });

    it('should still track usedInputTypes correctly after fixes', async () => {
      const output = await generate(dmmf);

      // Should have all necessary input types
      expect(output.inputTypes).toContain('input UserWhereInput');
      expect(output.inputTypes).toContain('input PostWhereInput');
      expect(output.inputTypes).toContain('input IntFilter');
      expect(output.inputTypes).toContain('input StringFilter');
    });

    it('should generate valid TypeScript after all fixes', async () => {
      const output = await generate(dmmf);

      // Index file should be valid TypeScript
      expect(output.indexFile).toContain('const typeDefs');
      expect(output.indexFile).toContain('const resolvers');
      expect(output.indexFile).toContain('export { typeDefs, resolvers }');

      // Resolvers should be valid TypeScript
      output.models.forEach(model => {
        expect(model.resolvers).toContain('const resolvers = {');
        expect(model.resolvers).toContain('export default resolvers');
        expect(model.resolvers).not.toContain('undefined');
      });
    });
  });
});
