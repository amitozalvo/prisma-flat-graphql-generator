import { describe, it, expect } from 'vitest';

describe('Enum Handling (Prisma 5 vs 7 Compatibility)', () => {
  describe('Enum value extraction', () => {
    it('should handle Prisma 5 enum format (values as strings)', () => {
      const prisma5Enum = {
        name: 'Role',
        values: ['ADMIN', 'USER', 'MODERATOR'],
      };

      // Simulating the enum handling logic from generate.ts
      const enumValues = 'data' in prisma5Enum ? (prisma5Enum as any).data : (prisma5Enum as any).values;
      const extractedValues: string[] = [];

      if (Array.isArray(enumValues)) {
        enumValues.forEach((item: any) => {
          const enumValue = typeof item === 'string' ? item : item.key;
          extractedValues.push(enumValue);
        });
      }

      expect(extractedValues).toEqual(['ADMIN', 'USER', 'MODERATOR']);
    });

    it('should handle Prisma 7 enum format (data with key/value)', () => {
      const prisma7Enum = {
        name: 'Role',
        data: [
          { key: 'ADMIN', value: 'ADMIN' },
          { key: 'USER', value: 'USER' },
          { key: 'MODERATOR', value: 'MODERATOR' },
        ],
      };

      // Simulating the enum handling logic from generate.ts
      const enumValues = 'data' in prisma7Enum ? prisma7Enum.data : (prisma7Enum as any).values;
      const extractedValues: string[] = [];

      if (Array.isArray(enumValues)) {
        enumValues.forEach((item: any) => {
          const enumValue = typeof item === 'string' ? item : item.key;
          extractedValues.push(enumValue);
        });
      }

      expect(extractedValues).toEqual(['ADMIN', 'USER', 'MODERATOR']);
    });

    it('should handle mixed scenarios gracefully', () => {
      // Testing edge case where enum might be empty
      const emptyEnum = {
        name: 'Empty',
        data: [],
      };

      const enumValues = 'data' in emptyEnum ? emptyEnum.data : (emptyEnum as any).values;
      const extractedValues: string[] = [];

      if (Array.isArray(enumValues)) {
        enumValues.forEach((item: any) => {
          const enumValue = typeof item === 'string' ? item : item.key;
          extractedValues.push(enumValue);
        });
      }

      expect(extractedValues).toEqual([]);
    });
  });

  describe('Backwards compatibility', () => {
    it('should work with both formats without errors', () => {
      const testEnums = [
        { name: 'Role1', values: ['A', 'B'] },
        { name: 'Role2', data: [{ key: 'C', value: 'C' }] },
      ];

      testEnums.forEach(enumDef => {
        expect(() => {
          const enumValues = 'data' in enumDef ? (enumDef as any).data : (enumDef as any).values;
          const extracted: string[] = [];

          if (Array.isArray(enumValues)) {
            enumValues.forEach((item: any) => {
              const enumValue = typeof item === 'string' ? item : item.key;
              extracted.push(enumValue);
            });
          }
        }).not.toThrow();
      });
    });
  });
});
