import { DMMF } from "@prisma/generator-helper";
import pluralize, { singular } from 'pluralize';
import { GenerateOutput, GraphqlGeneratorOptions, SingleModelOutput } from "./types.js";
import { format } from "prettier";
import { INPUT_TYPES_FILE_NAME, RESOLVERS_FILE_NAME, TYPE_DEFS_FILE_NAME } from "./constants.js";

const allQueries = ["findFirst", "findMany", "count"];
type UsedTypes = Set<string>

export default async function generate(dmmf: DMMF.Document, options?: GraphqlGeneratorOptions): Promise<GenerateOutput> {
    const models = !!options?.models ? dmmf.datamodel.models.filter(m => options.models!.includes(m.name)) : dmmf.datamodel.models;
    const usedInputTypes = new Set<string>();

    const generatedModelsPromises = models.map(model => {
        if (!!options?.excludeModels && options.excludeModels.includes(model.name)) {
            // Skip excluded models
            return null;
        }

        return generateModelResolversAndTypeDef(model, dmmf, usedInputTypes, options);
    }).filter(o => !!o) as Promise<SingleModelOutput>[];

    const generatedModels = await Promise.all(generatedModelsPromises);
    const usedModels = generatedModels.map(m => m.modelName);

    const formattedModels = await formatModelsOutput(generatedModels);
    const inputTypes = await formatTypescript(await getInputTypes(dmmf.schema, usedInputTypes, usedModels, options));

    const indexFile = generateIndexFile(generatedModels);

    return {
        indexFile,
        inputTypes,
        models: formattedModels
    }
}

async function getInputTypes(schema: DMMF.Schema, usedInputTypes: UsedTypes, usedModels: string[], options?: GraphqlGeneratorOptions) {
    const excludeInputFields = new Set<string>(options?.excludeInputFields);
    const excludeOutputFields = new Set<string>(options?.excludeOutputFields);

    const fileContent: string[] = ['scalar Json', 'scalar DateTime', 'type BatchPayload {', 'count: Int!', '}', ''];
    const writtenTypes = new Set<string>(); // Track types already written to fileContent

    function addEnumTypesToFileContent(enums: any[], usedInputTypes: UsedTypes) {
        enums.forEach((item) => {
            if (!usedInputTypes.has(item.name)) return;
            if (writtenTypes.has(item.name)) return; // Skip if already written

            writtenTypes.add(item.name);
            fileContent.push(`enum ${item.name} {`);
            // Prisma 7 changed from values: string[] to data: { key: string; value: string; }[]
            const enumValues = 'data' in item ? item.data : item.values;
            if (Array.isArray(enumValues)) {
                enumValues.forEach((item2: any) => {
                    const enumValue = typeof item2 === 'string' ? item2 : item2.key;
                    if (excludeInputFields.has(enumValue)) {
                        return;
                    }
                    fileContent.push(enumValue);
                });
            }
            fileContent.push('}', '');
        });
    }
    function addInputObjectTypesToFileContent(inputObjectTypes: DMMF.InputType[], localUsedInputTypes: UsedTypes) {
        const remainingInputTypes: Set<string> = new Set<string>();

        inputObjectTypes.forEach((input) => {
            if (input.fields.length > 0) {
                if (!localUsedInputTypes.has(input.name)) {
                    return;
                }
                if (writtenTypes.has(input.name)) {
                    return; // Skip if already written to fileContent
                }

                let actualFieldsCount = 0;

                fileContent.push(`input ${input.name} {`, '');
                input.fields
                    .forEach((field) => {
                        if (excludeInputFields.has(field.name)) {
                            return;
                        }

                        const inputType = getInputType(field);
                        if (schema.inputObjectTypes.prisma?.find(t => t.name === inputType.type)?.fields.some(f => f.isRequired && excludeInputFields.has(f.name))) {
                            return;
                        }

                        if (!localUsedInputTypes.has(inputType.type)) {
                            if (inputType.location === "inputObjectTypes") {
                                remainingInputTypes.add(inputType.type);
                            }
                            else if (inputType.location === "enumTypes") {
                                // For enum, we don't need to track the remaining items
                                usedInputTypes.add(inputType.type);
                            }
                        }

                        ++actualFieldsCount;
                        fileContent.push(
                            `${field.name}: ${inputType.isList ? `[${inputType.type}!]` : inputType.type}${field.isRequired ? '!' : ''
                            }`,
                        );
                    });

                if (actualFieldsCount === 0) {
                    if (localUsedInputTypes.has(input.name)) {
                        throw new Error(`${input.name} is empty, probably due to excludedInputFields. But it's being used by other parts of the schema`);
                    }
                    fileContent.pop();
                    fileContent.pop();
                } else {
                    fileContent.push('}', '');
                    writtenTypes.add(input.name); // Mark as written after successfully adding
                }
            }
        });

        return remainingInputTypes;
    }

    if (schema) {
        const enums = [...(schema.enumTypes.prisma || [])];
        if (schema.enumTypes.model) enums.push(...schema.enumTypes.model);
        const inputObjectTypes = [...(schema.inputObjectTypes.prisma || [])];
        if (schema.inputObjectTypes.model) inputObjectTypes.push(...schema.inputObjectTypes.model);

        let remainingInputTypes = usedInputTypes;
        let remainingCount: number;
        let index = 0;
        do {
            if (index > 5) {
                throw new Error("Too many iterations");
            }

            remainingInputTypes = addInputObjectTypesToFileContent(inputObjectTypes, remainingInputTypes);
            const difference = Array.from(remainingInputTypes).filter(item => !usedInputTypes.has(item));
            remainingCount = difference.length;
            difference.forEach(type => usedInputTypes.add(type));
            ++index;
        }
        while (remainingCount > 0);

        addEnumTypesToFileContent(enums, usedInputTypes);

        // NOTE: Aggregate and Count output types are commented out since we only support
        // findFirst/findMany queries. When aggregation support is added, uncomment this:
        //
        // schema?.outputObjectTypes.prisma
        //     .filter((type) => type.name.includes('Aggregate') || type.name.endsWith('CountOutputType'))
        //     .forEach((type) => {
        //         if (!usedModels.some(m => type.name.startsWith(m))) return;
        //         if (writtenTypes.has(type.name)) return; // Skip if already written
        //
        //         writtenTypes.add(type.name);
        //         fileContent.push(`type ${type.name} {`, '');
        //         type.fields
        //             .filter((field) => !excludeOutputFields.has(field.name))
        //             .forEach((field) => {
        //                 fileContent.push(
        //                     `${field.name}: ${field.outputType.isList ? `[${field.outputType.type}!]` : field.outputType.type}${!field.isNullable ? '!' : ''
        //                     }`,
        //                 );
        //             });
        //         fileContent.push('}', '');
        //     });
    }

    const content = await formatGraphql(fileContent.join('\n'));

    return `import { gql } from 'graphql-tag';\n
    export default gql\`\n${content}\n\`;\n`
}

async function generateModelResolversAndTypeDef(model: DMMF.Model, dmmf: DMMF.Document, usedInputTypes: UsedTypes, options?: GraphqlGeneratorOptions): Promise<SingleModelOutput> {
    const typeDef = await getTypeDef(model, dmmf.schema, usedInputTypes, options);
    const resolvers = getResolvers(model, options);

    return {
        modelName: model.name,
        typeDef,
        resolvers,
    }
}

function pluralName(modelName: string) {
    return pluralize(singularName(modelName));
}

function singularName(modelName: string) {
    if (pluralize(modelName) === modelName) {
        modelName = singular(modelName);
    }

    return `${modelName[0].toLowerCase()}${modelName.slice(1)}`
}

function getResolvers(model: DMMF.Model, options?: GraphqlGeneratorOptions) {
    // Generate field metadata for buildPrismaSelect
    const fieldMetadata = model.fields.map(field => {
        return `  ${field.name}: { kind: '${field.kind}', type: '${field.type}', isList: ${field.isList} }`;
    }).join(',\n');

    const fieldsConstant = `const ${model.name.toUpperCase()}_FIELDS = {\n${fieldMetadata}\n};`;

    // Generate buildPrismaSelect utility
    const buildPrismaSelectUtil = `
function buildPrismaSelect(info: any, modelFields: any): any {
  if (!info?.fieldNodes?.[0]?.selectionSet) {
    return {};
  }

  const selections = info.fieldNodes[0].selectionSet.selections;
  const select: any = {};

  for (const selection of selections) {
    if (selection.kind !== 'Field') continue;

    const fieldName = selection.name.value;

    // Skip GraphQL meta fields
    if (fieldName.startsWith('__')) continue;

    const fieldInfo = modelFields[fieldName];

    if (!fieldInfo) continue;

    if (fieldInfo.kind === 'object') {
      // Relation field - add to select with nested selection
      if (selection.selectionSet) {
        select[fieldName] = buildNestedSelect(selection.selectionSet);
      } else {
        select[fieldName] = true;
      }
    } else {
      // Scalar/enum field - add to select
      select[fieldName] = true;
    }
  }

  return Object.keys(select).length > 0 ? { select } : {};
}

function buildNestedSelect(selectionSet: any): any {
  const select: any = {};

  for (const selection of selectionSet.selections) {
    if (selection.kind !== 'Field') continue;
    const fieldName = selection.name.value;

    // Skip GraphQL meta fields
    if (fieldName.startsWith('__')) continue;

    // If this field has nested selections, it's a relation - recurse
    if (selection.selectionSet) {
      select[fieldName] = buildNestedSelect(selection.selectionSet);
    } else {
      // Scalar field
      select[fieldName] = true;
    }
  }

  return Object.keys(select).length > 0 ? { select } : true;
}`;

    // Generate resolvers with info parameter and buildPrismaSelect
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

            case "count":
                return `${pluralName(model.name)}Count: (_parent: any, args: any, context: any) => {
                    return context.prisma.${model.name}.count({ where: args.where })
                }`

            default:
                throw new Error("Unknown query: " + query);
        }
    });

    return `${fieldsConstant}\n\n${buildPrismaSelectUtil}\n\nconst resolvers = {
                Query: {
                    ${resolvers.join(',\n')}
                }
            }\n
            export default resolvers;`;
}

async function getTypeDef(model: DMMF.Model, schema: DMMF.Schema, usedInputTypes: UsedTypes, options?: GraphqlGeneratorOptions) {
    const type = getType(schema.outputObjectTypes.model.find(m => m.name === model.name)!, options?.excludeOutputFields ?? [], usedInputTypes);

    const queriesTypeDefs = (options?.queries ?? allQueries).map(query => {
        switch (query) {
            case "findFirst": {
                const inputArgs = getQueryInputArguments(model.name, query, schema, usedInputTypes);
                return `${singularName(model.name)} (${inputArgs}): ${model.name} `
            }

            case "findMany": {
                const inputArgs = getQueryInputArguments(model.name, query, schema, usedInputTypes);
                return `${pluralName(model.name)}(${inputArgs}): [${model.name}!]!`
            }

            case "count": {
                // For count, only use 'where' argument
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
            }

            default:
                throw new Error("Unknown query: " + query);
        }
    });

    const formattedSchema = await formatGraphql(`${type}\n
        type Query { ${queriesTypeDefs.join("\n")} }`);

    return `import gql from 'graphql-tag';\n
    export default gql\`
        ${formattedSchema}
    \``
}

function getQueryInputArguments(modelName: string, query: string, schema: DMMF.Schema, usedInputTypes: UsedTypes) {
    const args = schema.outputObjectTypes.prisma
        .find((type) => type.name === "Query")
        ?.fields.find((field) => field.name === `${query}${modelName}`)?.args;

    if (!args) {
        throw new Error("No args for: " + modelName);
    }

    const getType = (arg: DMMF.SchemaArg) => {
        const inputType = getInputType(arg);
        usedInputTypes.add(inputType.type);
        let type = `${inputType.type}`;

        if (arg.isRequired) {
            type = `${type}!`;
        }

        if (inputType.isList) {
            type = `[${type}]`;
        }

        return type;
    };

    if (!args) {
        throw new Error(`Could not extract input arguments from '${modelName}'`);
    }

    return args.map((arg) => `${arg.name}: ${getType(arg)}`).join("\n");
}

const getInputType = (field: DMMF.SchemaArg) => {
    let index = 0;
    if (field.inputTypes.length > 1) {
        if (field.inputTypes.some((item) => item.isList && item.location === 'inputObjectTypes')) {
            index = field.inputTypes.findIndex((item) => item.isList && item.location === 'inputObjectTypes');
        } else if (field.inputTypes.some((item) => item.isList)) {
            index = field.inputTypes.findIndex((item) => item.isList);
        } else if (field.inputTypes.some((item) => item.location === 'inputObjectTypes')) {
            index = field.inputTypes.findIndex((item) => item.location === 'inputObjectTypes');
        } else if (field.inputTypes.some((item) => item.type === 'Json')) {
            index = field.inputTypes.findIndex((item) => item.type === 'Json');
        }
    }
    return field.inputTypes[index];
};

function getType(modelOutputType: DMMF.OutputType, excludeFields: string[], usedInputTypes: UsedTypes) {
    const fields = modelOutputType.fields.map((field) => {
        if (excludeFields.includes(field.name)) {
            return null;
        }

        // Skip aggregate fields (_count, etc.) since we only support findFirst/findMany
        if (field.name.startsWith('_')) {
            return null;
        }

        let fieldStr = "";

        fieldStr += field.name;
        if (field.args.length > 0) {
            fieldStr += "(";
            for (let arg of field.args) {
                const inputType = getInputType(arg);
                usedInputTypes.add(inputType.type);
                fieldStr += `${arg.name}: ${inputType.isList ? `[${inputType.type}]` : inputType.type} `;
            }
            fieldStr += ")";
        }

        fieldStr += `: ${field.outputType.isList
            ? `[${field.outputType.type}!]!`
            : `${field.outputType.type}${!field.isNullable ? '!' : ''}`
            } `;

        return fieldStr;
    }).filter(f => !!f);

    return `type ${modelOutputType.name} {
        ${fields.join("\n")}
    }`
}

function formatModelsOutput(output: SingleModelOutput[]): Promise<SingleModelOutput[]> {
    return Promise.all(output.map(({ modelName, resolvers, typeDef }) => {
        return Promise.all([formatTypescript(resolvers), formatTypescript(typeDef)]).then(([resolvers, typeDef]) => ({ modelName, resolvers, typeDef }))
    }));
}

function formatTypescript(content: string) {
    return format(content, {
        singleQuote: true,
        semi: false,
        trailingComma: 'all',
        parser: "typescript"
    });
}
async function formatGraphql(content: string) {
    return await format(content, {
        singleQuote: true,
        semi: false,
        trailingComma: 'all',
        parser: "graphql"
    });
}

function generateIndexFile(models: SingleModelOutput[]) {
    const imports = models.flatMap(m => [`import ${m.modelName}_resolvers from './${m.modelName}/${RESOLVERS_FILE_NAME}';`, `import ${m.modelName}_typeDefs from './${m.modelName}/${TYPE_DEFS_FILE_NAME}';`]).join("\n");

    // Inline Json scalar implementation (no external dependencies)
    const jsonScalarResolver = `const JsonScalar = {
  name: 'Json',
  description: 'The \`Json\` scalar type represents JSON values as specified by ECMA-404',
  serialize: (value: any) => value,
  parseValue: (value: any) => value,
  parseLiteral: (ast: any) => {
    switch (ast.kind) {
      case 'StringValue':
      case 'BooleanValue':
        return ast.value;
      case 'IntValue':
      case 'FloatValue':
        return parseFloat(ast.value);
      case 'ObjectValue':
        return ast.fields.reduce((acc: any, field: any) => {
          acc[field.name.value] = JsonScalar.parseLiteral(field.value);
          return acc;
        }, {});
      case 'ListValue':
        return ast.values.map((v: any) => JsonScalar.parseLiteral(v));
      case 'NullValue':
        return null;
      default:
        return null;
    }
  }
};`;

    const consts = [
        `const typeDefs = [inputTypes, ${models.map(m => `${m.modelName}_typeDefs`).join(", ")}]`,
        `const resolvers = [{ Json: JsonScalar }, ${models.map(m => `${m.modelName}_resolvers`).join(", ")}]`
    ].join("\n")

    return [
        `import inputTypes from './${INPUT_TYPES_FILE_NAME}';\n\n`,
        imports,
        "\n\n",
        jsonScalarResolver,
        "\n\n",
        consts,
        "\n\nexport { typeDefs, resolvers }"
    ].join('');
}
