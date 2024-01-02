import { DMMF } from "@prisma/generator-helper";
import pluralize, { singular } from 'pluralize';
import { GenerateOutput, GraphqlGeneratorOptions, SingleModelOutput } from "./types.js";
import { format } from "prettier";
import { INPUT_TYPES_FILE_NAME, RESOLVERS_FILE_NAME, TYPE_DEFS_FILE_NAME } from "./constants.js";

const allQueries = ["findFirst", "findMany"];
type UsedTypes = Set<string>

export default async function generate(dmmf: DMMF.Document, options?: GraphqlGeneratorOptions): Promise<GenerateOutput> {
    const models = !!options?.models ? dmmf.datamodel.models.filter(m => options.models!.includes(m.name)) : dmmf.datamodel.models;
    const usedInputTypes = new Set<string>();

    const generatedModels = models.map(model => {
        if (!!options?.excludeModels && options.excludeModels.includes(model.name)) {
            // Skip excluded models
            return null;
        }

        return generateModelResolversAndTypeDef(model, dmmf, usedInputTypes, options);
    }).filter(o => !!o) as SingleModelOutput[];

    const usedModels = generatedModels.map(m => m.modelName);

    const formattedModels = await formatModelsOutput(generatedModels);
    const inputTypes = await formatTypescript(getInputTypes(dmmf.schema, usedInputTypes, usedModels, options));

    const indexFile = generateIndexFile(generatedModels);

    return {
        indexFile,
        inputTypes,
        models: formattedModels
    }
}

function getInputTypes(schema: DMMF.Schema, usedInputTypes: UsedTypes, usedModels: string[], options?: GraphqlGeneratorOptions) {
    const excludeInputFields = new Set<string>(options?.excludeInputFields);
    const excludeOutputFields = new Set<string>(options?.excludeOutputFields);

    const fileContent: string[] = ['scalar Json', 'scalar DateTime', 'type BatchPayload {', 'count: Int!', '}', ''];
    function addEnumTypesToFileContent(enums: DMMF.SchemaEnum[], usedInputTypes: UsedTypes) {
        enums.forEach((item) => {
            if (!usedInputTypes.has(item.name)) return;

            fileContent.push(`enum ${item.name} {`);
            item.values.forEach((item2) => {
                if (excludeInputFields.has(item2)) {
                    return;
                }
                fileContent.push(item2);
            });
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

                let actualFieldsCount = 0;

                fileContent.push(`input ${input.name} {`, '');
                input.fields
                    .forEach((field) => {
                        if (excludeInputFields.has(field.name)) {
                            return;
                        }

                        const inputType = getInputType(field);
                        if (schema.inputObjectTypes.prisma.find(t => t.name === inputType.type)?.fields.some(f => f.isRequired && excludeInputFields.has(f.name))) {
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
                }
            }
        });

        return remainingInputTypes;
    }

    if (schema) {
        const enums = [...schema.enumTypes.prisma];
        if (schema.enumTypes.model) enums.push(...schema.enumTypes.model);
        const inputObjectTypes = [...schema.inputObjectTypes.prisma];
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

        schema?.outputObjectTypes.prisma
            .filter((type) => type.name.includes('Aggregate') || type.name.endsWith('CountOutputType'))
            .forEach((type) => {
                if (!usedModels.some(m => type.name.startsWith(m))) return;

                fileContent.push(`type ${type.name} {`, '');
                type.fields
                    .filter((field) => !excludeOutputFields.has(field.name))
                    .forEach((field) => {
                        fileContent.push(
                            `${field.name}: ${field.outputType.isList ? `[${field.outputType.type}!]` : field.outputType.type}${!field.isNullable ? '!' : ''
                            }`,
                        );
                    });
                fileContent.push('}', '');
            });
    }

    const content = formatGraphql(fileContent.join('\n'));

    return `import { gql } from 'graphql-tag';\n
    export default gql\`\n${content}\n\`;\n`
}

function generateModelResolversAndTypeDef(model: DMMF.Model, dmmf: DMMF.Document, usedInputTypes: UsedTypes, options?: GraphqlGeneratorOptions): SingleModelOutput {
    const typeDef = getTypeDef(model, dmmf.schema, usedInputTypes, options);
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
    const resolvers = (options?.queries ?? allQueries).map(query => {
        switch (query) {
            case "findFirst":
                return `${singularName(model.name)}: (_parent: any, args: any, context: any) => {
                    return context.prisma.${model.name}.findFirst(args)
                }`

            case "findMany":
                return `${pluralName(model.name)}: (_parent: any, args: any, context: any) => {
                        return context.prisma.${model.name}.findMany(args)
                    }`
            default:
                throw new Error("Unknown query: " + query);
        }
    });

    return `const resolvers = {
                Query: {
                    ${resolvers}
                }
            }\n
            export default resolvers;`;
}

function getTypeDef(model: DMMF.Model, schema: DMMF.Schema, usedInputTypes: UsedTypes, options?: GraphqlGeneratorOptions) {
    const type = getType(schema.outputObjectTypes.model.find(m => m.name === model.name)!, options?.excludeOutputFields ?? [], usedInputTypes);

    const queriesTypeDefs = (options?.queries ?? allQueries).map(query => {
        const inputArgs = getQueryInputArguments(model.name, query, schema, usedInputTypes);
        switch (query) {
            case "findFirst":
                return `${singularName(model.name)} (${inputArgs}): ${model.name} `

            case "findMany":
                return `${pluralName(model.name)}(${inputArgs}): [${model.name}!]!`
            default:
                throw new Error("Unknown query: " + query);
        }
    });

    return `import gql from 'graphql-tag';\n
    export default gql\`
        ${formatGraphql(`${type}\n
        type Query { ${queriesTypeDefs.join("\n")} }`)}
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
function formatGraphql(content: string) {
    let res = content;
    format(content, {
        singleQuote: true,
        semi: false,
        trailingComma: 'all',
        parser: "graphql"
    }).then(formatted => res = formatted);

    return res;
}

function generateIndexFile(models: SingleModelOutput[]) {
    const imports = models.flatMap(m => [`import ${m.modelName}_resolvers from './${m.modelName}/${RESOLVERS_FILE_NAME}';`, `import ${m.modelName}_typeDefs from './${m.modelName}/${TYPE_DEFS_FILE_NAME}';`]).join("\n");
    const consts = [
        `const typeDefs = [inputTypes, ${models.map(m => `${m.modelName}_typeDefs`).join(", ")}]`,
        `const resolvers = [{ Json: GraphQLJSON }, ${models.map(m => `${m.modelName}_resolvers`).join(", ")}]`
    ].join("\n")

    return [
        `import GraphQLJSON from 'graphql-type-json'; // npm install graphql-type-json\n`,
        `import inputTypes from './${INPUT_TYPES_FILE_NAME}';\n\n`,
        imports,
        "\n\n",
        consts,
        "\n\nexport { typeDefs, resolvers }"
    ].join('');
}
