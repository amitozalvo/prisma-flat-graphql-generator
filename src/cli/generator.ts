import { generatorHandler, GeneratorOptions } from '@prisma/generator-helper'
import { logger, parseEnvValue } from '@prisma/internals'
import { GENERATOR_NAME } from './constants.js'
import generate from './generate.js'
import writeGenerateOutput from './writeGenerateOutput.js'
import { GraphqlGeneratorOptions } from './types.js'

const { version } = require('../../package.json')

generatorHandler({
    onManifest() {
        logger.info(`${GENERATOR_NAME}:Registered`)
        return {
            version,
            defaultOutput: './graphql',
            prettyName: GENERATOR_NAME,
        }
    },
    onGenerate: async (options: GeneratorOptions) => {
        const outputDir = parseEnvValue(options.generator.output!);
        options.generator.isCustomOutput
        const generatorOptions = options.generator.config as GraphqlGeneratorOptions;

        const output = await generate(options.dmmf, generatorOptions);
        await writeGenerateOutput(output, outputDir);
    },
})