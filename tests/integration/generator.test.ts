import { describe, it, expect, beforeAll } from 'vitest';
import { getDMMF } from '@prisma/internals';
import * as fs from 'fs/promises';
import * as path from 'path';
import generate from '../../src/cli/generate';
import { GraphqlGeneratorOptions } from '../../src/cli/types';

describe('GraphQL Generator Integration Tests', () => {
  let dmmf: any;
  const testSchemaPath = path.join(__dirname, '../fixtures/test-schema.prisma');

  beforeAll(async () => {
    const schema = await fs.readFile(testSchemaPath, 'utf-8');
    dmmf = await getDMMF({ datamodel: schema });
  });

  describe('Basic Generation', () => {
    it('should generate GraphQL schema and resolvers', async () => {
      const output = await generate(dmmf);

      expect(output).toBeDefined();
      expect(output.indexFile).toBeDefined();
      expect(output.inputTypes).toBeDefined();
      expect(output.models).toBeDefined();
      expect(output.models.length).toBeGreaterThan(0);
    });

    it('should generate files for all models', async () => {
      const output = await generate(dmmf);

      const modelNames = output.models.map(m => m.modelName);
      expect(modelNames).toContain('User');
      expect(modelNames).toContain('Post');
      expect(modelNames).toContain('Excluded');
    });

    it('should generate typeDefs and resolvers for each model', async () => {
      const output = await generate(dmmf);

      output.models.forEach(model => {
        expect(model.typeDef).toBeDefined();
        expect(model.typeDef).toContain('type Query');
        expect(model.typeDef.length).toBeGreaterThan(0);

        expect(model.resolvers).toBeDefined();
        expect(model.resolvers).toContain('Query:');
        expect(model.resolvers.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Model Exclusions', () => {
    it('should exclude models specified in excludeModels', async () => {
      const options: GraphqlGeneratorOptions = {
        excludeModels: ['Excluded'],
      };

      const output = await generate(dmmf, options);
      const modelNames = output.models.map(m => m.modelName);

      expect(modelNames).not.toContain('Excluded');
      expect(modelNames).toContain('User');
      expect(modelNames).toContain('Post');
    });

    it('should exclude multiple models', async () => {
      const options: GraphqlGeneratorOptions = {
        excludeModels: ['Excluded', 'Post'],
      };

      const output = await generate(dmmf, options);
      const modelNames = output.models.map(m => m.modelName);

      expect(modelNames).not.toContain('Excluded');
      expect(modelNames).not.toContain('Post');
      expect(modelNames).toContain('User');
    });
  });

  describe('Field Exclusions', () => {
    it('should exclude fields from output', async () => {
      const options: GraphqlGeneratorOptions = {
        excludeOutputFields: ['password'],
      };

      const output = await generate(dmmf, options);
      const userModel = output.models.find(m => m.modelName === 'User');

      expect(userModel).toBeDefined();
      expect(userModel!.typeDef).not.toContain('password');
      expect(userModel!.typeDef).toContain('email');
      expect(userModel!.typeDef).toContain('name');
    });

    it('should exclude fields from input filters', async () => {
      const options: GraphqlGeneratorOptions = {
        excludeInputFields: ['password'],
      };

      const output = await generate(dmmf, options);

      // Password should not appear in UserWhereInput
      const whereInputMatch = output.inputTypes.match(/input UserWhereInput \{([^}]+)\}/s);
      expect(whereInputMatch).toBeDefined();
      expect(whereInputMatch![1]).not.toContain('password');

      // Note: excludeInputFields excludes from filter inputs, not from aggregate output types
      // So password may still appear in UserMinAggregateOutputType, etc.
    });

    it('should exclude multiple fields', async () => {
      const options: GraphqlGeneratorOptions = {
        excludeOutputFields: ['password', 'createdAt'],
      };

      const output = await generate(dmmf, options);
      const userModel = output.models.find(m => m.modelName === 'User');

      expect(userModel!.typeDef).not.toContain('password');
      expect(userModel!.typeDef).not.toContain('createdAt');
    });
  });

  describe('Enum Generation', () => {
    it('should generate enums in inputTypes', async () => {
      const output = await generate(dmmf);

      expect(output.inputTypes).toContain('enum Role');
      expect(output.inputTypes).toContain('ADMIN');
      expect(output.inputTypes).toContain('USER');
      expect(output.inputTypes).toContain('MODERATOR');
    });

    it('should handle Prisma 7 enum format', async () => {
      const output = await generate(dmmf);

      // Should work with both Prisma 5 and 7 enum formats
      expect(output.inputTypes).toContain('enum SortOrder');
      expect(output.inputTypes).toContain('asc');
      expect(output.inputTypes).toContain('desc');
    });
  });

  describe('Relations', () => {
    it('should generate relations in typeDefs', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');
      const postModel = output.models.find(m => m.modelName === 'Post');

      expect(userModel!.typeDef).toContain('posts');
      expect(postModel!.typeDef).toContain('author');
    });

    it('should include filter arguments for relations', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');

      expect(userModel!.typeDef).toContain('where: PostWhereInput');
      expect(userModel!.typeDef).toContain('orderBy');
    });
  });

  describe('Query Types', () => {
    it('should generate findFirst and findMany queries', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');

      expect(userModel!.typeDef).toContain('user('); // findFirst
      expect(userModel!.typeDef).toContain('users('); // findMany
    });

    it('should include standard query arguments', async () => {
      const output = await generate(dmmf);
      const userModel = output.models.find(m => m.modelName === 'User');

      expect(userModel!.typeDef).toContain('where:');
      expect(userModel!.typeDef).toContain('orderBy:');
      expect(userModel!.typeDef).toContain('cursor:');
      expect(userModel!.typeDef).toContain('take:');
      expect(userModel!.typeDef).toContain('skip:');
    });
  });

  describe('Index File Generation', () => {
    it('should generate valid index file', async () => {
      const output = await generate(dmmf);

      expect(output.indexFile).toContain('const JsonScalar');
      expect(output.indexFile).toContain('export { typeDefs, resolvers }');
      expect(output.indexFile).not.toContain('graphql-type-json');
      expect(output.indexFile).not.toContain('GraphQLJSON');
    });

    it('should import all generated models', async () => {
      const output = await generate(dmmf);

      output.models.forEach(model => {
        expect(output.indexFile).toContain(`${model.modelName}_resolvers`);
        expect(output.indexFile).toContain(`${model.modelName}_typeDefs`);
      });
    });
  });

  describe('Standalone Resolver Features', () => {
    it('should generate field metadata constants', async () => {
      const output = await generate(dmmf);

      const userModel = output.models.find(m => m.modelName === 'User');
      expect(userModel!.resolvers).toContain('const USER_FIELDS');
      expect(userModel!.resolvers).toContain("kind: 'scalar'");
      expect(userModel!.resolvers).toContain("kind: 'object'");
      expect(userModel!.resolvers).toContain('isList: true');
      expect(userModel!.resolvers).toContain('isList: false');
    });

    it('should generate buildPrismaSelect utility', async () => {
      const output = await generate(dmmf);

      const userModel = output.models.find(m => m.modelName === 'User');
      expect(userModel!.resolvers).toContain('function buildPrismaSelect');
      expect(userModel!.resolvers).toContain('function buildNestedSelect');
      expect(userModel!.resolvers).toContain("fieldInfo.kind === 'object'");
      expect(userModel!.resolvers).toContain('{ select }');
      expect(userModel!.resolvers).toContain('buildNestedSelect(selection.selectionSet, fragments)');
    });

    it('should include info parameter in resolver signatures', async () => {
      const output = await generate(dmmf);

      const userModel = output.models.find(m => m.modelName === 'User');
      expect(userModel!.resolvers).toContain('(_parent: any, args: any, context: any, info: any)');
      expect(userModel!.resolvers).toContain('buildPrismaSelect(info,');
    });

    it('should not have external dependencies', async () => {
      const output = await generate(dmmf);

      // Index file should not import external packages
      expect(output.indexFile).not.toContain('@paljs');
      expect(output.indexFile).not.toContain('graphql-type-json');
      expect(output.indexFile).not.toContain('import GraphQLJSON');

      // Resolvers should not import external packages
      output.models.forEach(model => {
        expect(model.resolvers).not.toContain('@paljs');
        expect(model.resolvers).not.toContain('from "@paljs');
        expect(model.resolvers).not.toContain('import { PrismaSelect }');
      });
    });
  });

  describe('TypeScript/GraphQL Validity', () => {
    it('should generate valid GraphQL syntax', async () => {
      const output = await generate(dmmf);

      output.models.forEach(model => {
        // Basic GraphQL syntax checks
        expect(model.typeDef).toContain('type Query');
        expect(model.typeDef).toMatch(/type \w+ \{/);

        // Should not have syntax errors
        expect(model.typeDef).not.toContain('undefined');
        expect(model.typeDef).not.toContain('[object Object]');
      });
    });

    it('should generate valid TypeScript syntax', async () => {
      const output = await generate(dmmf);

      output.models.forEach(model => {
        // Basic TypeScript syntax checks
        expect(model.resolvers).toContain('Query:');
        expect(model.resolvers).toContain('prisma.');

        // Should not have syntax errors
        expect(model.resolvers).not.toContain('undefined');
      });
    });
  });
});
