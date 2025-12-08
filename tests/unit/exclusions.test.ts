import { describe, it, expect } from 'vitest';

describe('Field and Model Exclusions', () => {
  describe('Field filtering', () => {
    it('should filter fields from a list', () => {
      const fields = ['id', 'email', 'name', 'password', 'createdAt'];
      const excludeFields = new Set(['password', 'createdAt']);

      const filtered = fields.filter(field => !excludeFields.has(field));

      expect(filtered).toEqual(['id', 'email', 'name']);
      expect(filtered).not.toContain('password');
      expect(filtered).not.toContain('createdAt');
    });

    it('should handle case-sensitive exclusions', () => {
      const fields = ['Password', 'password', 'PASSWORD'];
      const excludeFields = new Set(['password']);

      const filtered = fields.filter(field => !excludeFields.has(field));

      expect(filtered).toEqual(['Password', 'PASSWORD']);
      expect(filtered).toContain('Password');
      expect(filtered).not.toContain('password');
    });

    it('should handle empty exclusion list', () => {
      const fields = ['id', 'name'];
      const excludeFields = new Set<string>();

      const filtered = fields.filter(field => !excludeFields.has(field));

      expect(filtered).toEqual(fields);
    });
  });

  describe('Model filtering', () => {
    it('should filter models from a list', () => {
      const models = ['User', 'Post', 'Internal', 'Admin'];
      const excludeModels = new Set(['Internal', 'Admin']);

      const filtered = models.filter(model => !excludeModels.has(model));

      expect(filtered).toEqual(['User', 'Post']);
      expect(filtered).not.toContain('Internal');
      expect(filtered).not.toContain('Admin');
    });
  });
});
