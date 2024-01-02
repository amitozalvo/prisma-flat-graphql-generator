export type GraphqlGeneratorOptions = {
    excludeModels?: string[]
    models?: string[]
    excludeInputFields?: string[]
    excludeOutputFields?: string[]
    queries?: string[]
    mutations?: string[]
    output?: string
}

export type GenerateOutput = { models: SingleModelOutput[], inputTypes: string, indexFile: string }

export type SingleModelOutput = {
    modelName: string
    typeDef: string
    resolvers: string
}