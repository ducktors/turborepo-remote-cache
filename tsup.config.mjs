import { defineConfig } from 'tsup'
import ts from 'typescript'

const cwd = process.cwd()
const tsConfigPath = ts.findConfigFile(cwd, ts.sys.fileExists, 'tsconfig.json')
if (!tsConfigPath) {
  throw new Error(`tsconfig.json not found in the current directory! ${cwd}`)
}
const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile)
const tsConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, cwd)

export default defineConfig(options => ({
  entry: [...tsConfig.fileNames],
  outDir: options.outDir ?? tsConfig.options.outDir ?? 'dist',
  sourcemap: tsConfig.options.sourceMap,
  clean: true,
  target: tsConfig.raw?.compilerOptions?.target ?? 'node12',
  bundle: false,
}))
