import * as path from 'path';
import { GenerateOutput } from "./types.js";
import { writeFile, mkdir } from 'fs/promises';
import { INPUT_TYPES_FILE_NAME, RESOLVERS_FILE_NAME, TYPE_DEFS_FILE_NAME } from './constants.js';

export default async function writeGenerateOutput(data: GenerateOutput, outputPath: string) {
    await Promise.all(data.models.map(o => {
        const dir = path.join(outputPath, o.modelName);
        return Promise.all([writeFileAndDirectories(dir, `${RESOLVERS_FILE_NAME}.ts`, o.resolvers), writeFileAndDirectories(dir, `${TYPE_DEFS_FILE_NAME}.ts`, o.typeDef)]);
    }));

    await writeFileAndDirectories(outputPath, `${INPUT_TYPES_FILE_NAME}.ts`, data.inputTypes);
    await writeFileAndDirectories(outputPath, "index.ts", data.indexFile);
}

const writeFileAndDirectories = async (dir: string, filename: string, content: string) => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, filename), content);
}