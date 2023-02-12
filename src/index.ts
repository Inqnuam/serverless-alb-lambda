import path from "path";
import { Daemon } from "./lib/daemon";
import { ILambdaMock } from "./lib/lambdaMock";
import { log } from "./lib/colorize";
import { zip } from "./lib/zip";
import esbuild from "esbuild";
import type { BuildOptions, BuildResult } from "esbuild";
import type Serverless from "serverless";
import { Handlers } from "./lib/handlers";
import { buildOptimizer } from "./lib/esbuild/buildOptimizer";
import { parseEvents } from "./lib/parseEvents/index";

const cwd = process.cwd();
const DEFAULT_LAMBDA_TIMEOUT = 6;
const DEFAULT_LAMBDA_MEMORY_SIZE = 1024;
const isLocalEnv = {
  IS_OFFLINE: true,
  IS_LOCAL: true,
};

class ServerlessAwsLambda extends Daemon {
  #lambdas: ILambdaMock[];
  watch = true;
  isDeploying = false;
  isPackaging = false;
  serverless: Serverless;
  options: any;
  pluginConfig: any;
  tsconfig: any;
  commands: any;
  hooks: any;
  esBuildConfig: any;
  buildContext: any;
  customEsBuildConfig: any;
  customBuildCallback?: Function;
  defaultVirtualEnvs: any;
  nodeVersion = false;
  invokeName?: string;
  constructor(serverless: any, options: any) {
    super({ debug: process.env.SLS_DEBUG == "*" });

    this.#lambdas = [];
    this.serverless = serverless;
    this.options = options;
    // @ts-ignore
    this.isPackaging = this.serverless.processedInput.commands.includes("package");
    // @ts-ignore
    this.isDeploying = this.serverless.processedInput.commands.includes("deploy");
    // @ts-ignore
    this.nodeVersion = this.serverless.service.provider.runtime?.replace(/[^0-9]/g, "");
    this.watch = !this.isPackaging && !this.isDeploying;
    if (!this.watch) {
      log.BR_BLUE("Packaging using serverless-aws-lambda...");
    } else {
      log.BR_BLUE("Launching serverless-aws-lambda...");
    }
    serverless.configSchemaHandler.defineFunctionProperties("aws", {
      properties: {
        virtualEnvs: { type: "object" },
        online: { type: "boolean" },
      },
    });

    if (this.serverless.service.custom) {
      this.pluginConfig = this.serverless.service.custom["serverless-aws-lambda"];
      this.defaultVirtualEnvs = this.serverless.service.custom["virtualEnvs"] ?? {};
      ServerlessAwsLambda.PORT = this.pluginConfig?.port;
    }

    const cmdPort = this.options.p ?? this.options.port;
    if (cmdPort) {
      ServerlessAwsLambda.PORT = cmdPort;
    }

    const processPort = Number(process.env.PORT);

    if (!isNaN(processPort)) {
      ServerlessAwsLambda.PORT = processPort;
    }

    this.commands = {
      "aws-lambda": {
        usage: "Mock AWS AWS-Lambda",
        lifecycleEvents: ["run"],
        options: {
          port: {
            usage: "Specify the server port (default: 3000)",
            shortcut: "p",
            required: false,
            type: "number",
          },
          watch: {
            usage: "Watch for file changes (default: true)",
            shortcut: "w",
            required: false,
            type: "boolean",
          },
        },
      },
    };

    this.hooks = {
      "aws-lambda:run": this.init.bind(this),
      "before:package:initialize": this.excludeFunctions.bind(this),
      "before:package:createDeploymentArtifacts": this.init.bind(this, true),
      "before:deploy:function:packageFunction": this.init.bind(this, true),
      "before:invoke:local:invoke": this.invokeLocal.bind(this),
    };
  }

  async invokeLocal() {
    this.invokeName = this.options.function;
    await this.init(false);
  }

  async init(isPackaging: boolean) {
    this.#setRuntimeEnvs();
    this.#lambdas = this.#getLambdas();
    await this.#setCustomEsBuildConfig();
    this.setEsBuildConfig(isPackaging);
    await this.buildAndWatch();
  }
  excludeFunctions() {
    // @ts-ignore
    Object.entries(this.serverless.service.functions).forEach(([name, { online }]) => {
      if (typeof online == "boolean" && online === false) {
        delete this.serverless.service.functions[name];
      }
    });
  }
  setEsBuildConfig = (isPackaging: boolean) => {
    const entryPoints = this.#lambdas.map((x) => x.esEntryPoint);

    let esBuildConfig: BuildOptions = {
      platform: "node",
      sourcemap: !isPackaging,
      minify: isPackaging,
      metafile: true,
      target: "ES6",
      format: "cjs",
      entryPoints: entryPoints,
      outdir: path.join(cwd, ".aws_lambda"),
      outbase: "src",
      bundle: true,
      plugins: [],
      external: ["esbuild"],
    };

    if (typeof this.nodeVersion == "string") {
      esBuildConfig.plugins?.push(buildOptimizer({ isLocal: !this.isDeploying && !this.isPackaging, nodeVersion: Number(this.nodeVersion), buildCallback: this.buildCallback }));
    }

    if (this.customEsBuildConfig) {
      if (Array.isArray(this.customEsBuildConfig.plugins)) {
        esBuildConfig.plugins!.push(...this.customEsBuildConfig.plugins);
      }

      if (Array.isArray(this.customEsBuildConfig.external)) {
        esBuildConfig.external!.push(...this.customEsBuildConfig.external);
      }

      if (typeof this.customEsBuildConfig.sourcemap == "boolean") {
        esBuildConfig.sourcemap = this.customEsBuildConfig.sourcemap;
      }

      if (typeof this.customEsBuildConfig.minify == "boolean") {
        esBuildConfig.minify = this.customEsBuildConfig.minify;
      }

      if (typeof this.customEsBuildConfig.outdir == "string") {
        esBuildConfig.outdir = this.customEsBuildConfig.outdir;
      }

      if (typeof this.customEsBuildConfig.outbase == "string") {
        esBuildConfig.outbase = this.customEsBuildConfig.outbase;
      }

      if (typeof this.customEsBuildConfig.target == "string") {
        esBuildConfig.target = this.customEsBuildConfig.target;
      }

      if (typeof this.customEsBuildConfig.tsconfig == "string") {
        esBuildConfig.tsconfig = this.customEsBuildConfig.tsconfig;
      }

      if (typeof this.customEsBuildConfig.tsconfigRaw == "string") {
        // @ts-ignore
        esBuildConfig.tsconfigRaw = this.customEsBuildConfig.tsconfigRaw;
      }

      if (typeof this.customEsBuildConfig.legalComments == "string") {
        esBuildConfig.legalComments = this.customEsBuildConfig.legalComments;
      }

      if (Array.isArray(this.customEsBuildConfig.pure)) {
        esBuildConfig.pure = this.customEsBuildConfig.pure;
      }

      if (Array.isArray(this.customEsBuildConfig.drop)) {
        esBuildConfig.drop = this.customEsBuildConfig.drop;
      }

      if (Array.isArray(this.customEsBuildConfig.resolveExtensions)) {
        esBuildConfig.resolveExtensions = this.customEsBuildConfig.resolveExtensions;
      }

      if (Array.isArray(this.customEsBuildConfig.mainFields)) {
        esBuildConfig.mainFields = this.customEsBuildConfig.mainFields;
      }

      if (Array.isArray(this.customEsBuildConfig.nodePaths)) {
        esBuildConfig.nodePaths = this.customEsBuildConfig.nodePaths;
      }

      if (typeof this.customEsBuildConfig.ignoreAnnotations == "boolean") {
        esBuildConfig.ignoreAnnotations = this.customEsBuildConfig.ignoreAnnotations;
      }
      if (typeof this.customEsBuildConfig.treeShaking == "boolean") {
        esBuildConfig.treeShaking = this.customEsBuildConfig.treeShaking;
      }

      if (this.customEsBuildConfig.define && typeof this.customEsBuildConfig.define == "object") {
        esBuildConfig.define = this.customEsBuildConfig.define;
      }

      if (this.customEsBuildConfig.banner && typeof this.customEsBuildConfig.banner == "object") {
        esBuildConfig.banner = this.customEsBuildConfig.banner;
      }
      if (this.customEsBuildConfig.footer && typeof this.customEsBuildConfig.footer == "object") {
        esBuildConfig.footer = this.customEsBuildConfig.footer;
      }

      if (this.customEsBuildConfig.loader && typeof this.customEsBuildConfig.loader == "object") {
        esBuildConfig.loader = this.customEsBuildConfig.loader;
      }
      if (this.customEsBuildConfig.alias && typeof this.customEsBuildConfig.alias == "object") {
        esBuildConfig.alias = this.customEsBuildConfig.alias;
      }

      if (typeof this.customEsBuildConfig.assetNames == "string") {
        esBuildConfig.assetNames = this.customEsBuildConfig.assetNames;
      }

      if (typeof this.customEsBuildConfig.entryNames == "string") {
        esBuildConfig.entryNames = this.customEsBuildConfig.entryNames;
      }

      if (typeof this.customEsBuildConfig.publicPath == "string") {
        esBuildConfig.publicPath = this.customEsBuildConfig.publicPath;
      }

      if (Array.isArray(this.customEsBuildConfig.inject)) {
        esBuildConfig.inject = this.customEsBuildConfig.inject;
      }

      if (typeof this.customEsBuildConfig.splitting == "boolean") {
        esBuildConfig.splitting = this.customEsBuildConfig.splitting;
      }

      if (typeof this.customEsBuildConfig.preserveSymlinks == "boolean") {
        esBuildConfig.preserveSymlinks = this.customEsBuildConfig.preserveSymlinks;
      }
    }

    if (!esBuildConfig.bundle) {
      delete esBuildConfig.external;
    }
    this.esBuildConfig = esBuildConfig;
  };

  async buildAndWatch() {
    const result = await esbuild.context(this.esBuildConfig);
    this.buildContext = {
      stop: result.dispose,
    };

    await result.watch();
    if (!this.watch) {
      await result.dispose();
    }
  }

  buildCallback = async (result: BuildResult, isRebuild: boolean) => {
    if (isRebuild) {
      await this.#onRebuild(result);
    } else {
      const { outputs } = result.metafile!;
      this.#setLambdaEsOutputPaths(outputs);
      if (this.customBuildCallback) {
        try {
          await this.customBuildCallback(result, false);
        } catch (error) {
          console.log(error);
        }
      }

      if (this.invokeName) {
        const slsDeclaration = this.serverless.service.getFunction(this.invokeName);
        const foundLambda = this.#lambdas.find((x) => x.name == this.invokeName);

        if (foundLambda) {
          (slsDeclaration as Serverless.FunctionDefinitionHandler).handler = foundLambda.esOutputPath.replace(`${cwd}/`, "").replace(".js", `.${foundLambda.handlerName}`);
        }
      } else if (this.isDeploying || this.isPackaging) {
        let packageLambdas: ILambdaMock[] = this.#lambdas;

        if (this.options.function) {
          const foundLambda = this.#lambdas.find((x) => x.name == this.options.function);

          if (foundLambda) {
            packageLambdas = [foundLambda];
          }
        }
        // TODO: convert to promise all
        for (const l of packageLambdas.filter((x) => x.online)) {
          const slsDeclaration = this.serverless.service.getFunction(l.name) as Serverless.FunctionDefinitionHandler;

          const zipableBundledFilePath = l.esOutputPath.slice(0, -3);
          const zipOutputPath = await zip(zipableBundledFilePath, l.outName);

          // @ts-ignore
          slsDeclaration.package = { ...slsDeclaration.package, disable: true, artifact: zipOutputPath };
          slsDeclaration.handler = path.basename(l.handlerPath);
        }
      } else {
        this.listen(ServerlessAwsLambda.PORT, async (port: number, localIp: string) => {
          Handlers.PORT = port;
          await this.load(this.#lambdas);

          let output = `✅ AWS Lambda offline server is listening on http://localhost:${port}`;

          if (localIp) {
            output += ` | http://${localIp}:${port}`;
          }

          // @ts-ignore
          this.#lambdas.forEach((x) => x.setEnv("LOCAL_PORT", port));
          log.GREEN(output);
        });
      }
    }
  };

  async #onRebuild(result: BuildResult) {
    if (result?.errors?.length) {
      log.RED("watch build failed:");
      console.error(result.errors);
    } else {
      this.#setLambdaEsOutputPaths(result.metafile!.outputs);

      try {
        if (this.customBuildCallback) {
          await this.customBuildCallback(result, true);
          await this.load(this.#lambdas);
        } else {
          await this.load(this.#lambdas);
        }
      } catch (error) {
        console.error(error);
      }

      log.GREEN(`${new Date().toLocaleString()} 🔄✅ Rebuild `);
      process.send?.({ rebuild: true });
    }
  }
  #getLambdas() {
    const funcs = this.serverless.service.functions;
    let functionsNames = Object.keys(funcs);

    if (this.invokeName) {
      functionsNames = functionsNames.filter((x) => x == this.invokeName);
    }
    const albs = functionsNames.reduce((accum: any[], funcName: string) => {
      const lambda = funcs[funcName];

      const handlerPath = (lambda as Serverless.FunctionDefinitionHandler).handler;
      const lastPointIndex = handlerPath.lastIndexOf(".");
      const handlerName = handlerPath.slice(lastPointIndex + 1);
      const esEntryPoint = path.join(cwd, handlerPath.slice(0, lastPointIndex));
      const region = this.runtimeConfig.environment.AWS_REGION ?? this.runtimeConfig.environment.REGION;

      const slsDeclaration: any = this.serverless.service.getFunction(funcName);

      let lambdaDef: any = {
        name: funcName,
        outName: slsDeclaration.name,
        handlerPath,
        handlerName,
        esEntryPoint,
        memorySize: lambda.memorySize ?? this.runtimeConfig.memorySize ?? DEFAULT_LAMBDA_MEMORY_SIZE,
        timeout: lambda.timeout ?? this.runtimeConfig.timeout ?? DEFAULT_LAMBDA_TIMEOUT,
        endpoints: [],
        sns: [],
        ddb: [],
        s3: [],
        virtualEnvs: { ...this.defaultVirtualEnvs, ...(slsDeclaration.virtualEnvs ?? {}) },
        online: typeof slsDeclaration.online == "boolean" ? slsDeclaration.online : true,
        environment: {
          ...this.runtimeConfig.environment,
          ...lambda.environment,
          ...isLocalEnv,
        },
        invoke: async (event: any, info?: any) => {
          const foundLambda = this.getHandlerByName(`/@invoke/${funcName}`);
          if (foundLambda) {
            const res = await foundLambda.invoke(event, info);
            return res;
          } else {
            log.RED(`'${funcName}' is not mounted yet.\nPlease invoke it after the initial build is completed.`);
            return;
          }
        },
        invokeSub: [],
        setEnv: (key: string, value: string) => {
          this.setEnv(funcName, key, value);
        },
      };

      lambdaDef.onInvoke = (callback: (event: any, info?: any) => void) => {
        lambdaDef.invokeSub.push(callback);
      };

      if (process.env.NODE_ENV) {
        lambdaDef.environment.NODE_ENV = process.env.NODE_ENV;
      }
      if (region) {
        lambdaDef.environment.AWS_REGION = region;
      }

      if (lambda.events.length) {
        const { endpoints, sns, ddb, s3 } = parseEvents(lambda.events, this.serverless);
        lambdaDef.endpoints = endpoints;
        lambdaDef.sns = sns;
        lambdaDef.ddb = ddb;
        lambdaDef.s3 = s3;
      }
      // console.log(lambdaDef);
      accum.push(lambdaDef);
      return accum;
    }, []);

    return albs;
  }
  #setLambdaEsOutputPaths(outputs: any) {
    const outputNames = Object.keys(outputs)
      .filter((x) => !x.endsWith(".map") && outputs[x].entryPoint)
      .map((x) => {
        const element = outputs[x];
        const lastPointIndex = element.entryPoint.lastIndexOf(".");
        const entryPoint = path.join(cwd, element.entryPoint.slice(0, lastPointIndex));
        const esOutputPath = path.join(cwd, x);

        return {
          esOutputPath,
          entryPoint,
        };
      });

    this.#lambdas.forEach((x) => {
      const foundOutput = outputNames.find((w) => w.entryPoint == x.esEntryPoint);

      if (foundOutput) {
        x.esOutputPath = foundOutput.esOutputPath;
      }
    });
  }

  #setRuntimeEnvs() {
    const { environment, memorySize, timeout } = this.serverless.service.provider as any;

    this.runtimeConfig.memorySize = memorySize;
    this.runtimeConfig.timeout = timeout;
    this.runtimeConfig.environment = environment ?? {};

    if (process.env.AWS_PROFILE) {
      this.runtimeConfig.environment.AWS_PROFILE = process.env.AWS_PROFILE;
    }
  }

  setEnv(lambdaName: string, key: string, value: string) {
    const foundIndex = this.#lambdas.findIndex((x) => x.name == lambdaName);

    if (foundIndex > -1) {
      this.#lambdas[foundIndex].environment[key] = value;
      const slsDeclaration = this.serverless.service.getFunction(lambdaName);
      if (slsDeclaration) {
        if (!slsDeclaration.environment) {
          slsDeclaration.environment = {};
        }
        slsDeclaration.environment[key] = value;
      }
    } else {
      log.RED(`Can not set env var on '${lambdaName}'`);
    }
  }
  async #setCustomEsBuildConfig() {
    if (!this.pluginConfig || typeof this.pluginConfig?.configPath !== "string") {
      return;
    }

    const extPoint = this.pluginConfig.configPath.lastIndexOf(".");
    const customFilePath = this.pluginConfig.configPath.slice(0, extPoint);
    const configObjectName = this.pluginConfig.configPath.slice(extPoint + 1);

    const exportedFunc = require(path.resolve(cwd, customFilePath));

    if (!exportedFunc) {
      return;
    }

    const customConfigArgs = {
      stop: async (cb: (err?: any) => void) => {
        this.stop(cb);
        if (this.buildContext.stop) {
          await this.buildContext.stop();
        }
      },
      lambdas: this.#lambdas,
      isDeploying: this.isDeploying,
      isPackaging: this.isPackaging,
      setEnv: (n: string, k: string, v: string) => {
        this.setEnv(n, k, v);
      },
      port: ServerlessAwsLambda.PORT,
      stage: this.options.stage ?? this.serverless.service.provider.stage ?? "dev",
      esbuild: esbuild,
      serverless: this.serverless,
    };
    let exportedObject: any = {};

    if (typeof exportedFunc[configObjectName] == "function") {
      exportedObject = await exportedFunc[configObjectName](customConfigArgs);
    } else if (typeof exportedFunc == "function") {
      exportedObject = await exportedFunc(customConfigArgs);
    } else {
      return;
    }

    if (typeof exportedObject.buildCallback == "function") {
      this.customBuildCallback = exportedObject.buildCallback;
    }

    if (exportedObject.offline && typeof exportedObject.offline == "object") {
      if (Array.isArray(exportedObject.offline.request)) {
        this.customOfflineRequests = exportedObject.offline.request;
      }

      if (typeof exportedObject.offline.staticPath == "string") {
        this.serve = exportedObject.offline.staticPath;
      }
      if (typeof exportedObject.offline.port == "number") {
        ServerlessAwsLambda.PORT = exportedObject.offline.port;
      }

      if (typeof exportedObject.offline.onReady == "function") {
        this.onReady = exportedObject.offline.onReady;
      }
    }

    const customConfig = exportedObject.esbuild;
    if (!customConfig) {
      return;
    }
    let customEsBuild: any = {};
    if (Array.isArray(customConfig.plugins)) {
      customEsBuild.plugins = customConfig.plugins;
    }

    if (Array.isArray(customConfig.external)) {
      customEsBuild.external = customConfig.external;
    }

    if (typeof customConfig.sourcemap == "boolean") {
      customEsBuild.sourcemap = customConfig.sourcemap;
    }

    if (typeof customConfig.minify == "boolean") {
      customEsBuild.minify = customConfig.minify;
    }

    if (typeof customConfig.outdir == "string") {
      customEsBuild.outdir = customConfig.outdir;
    }

    if (typeof customConfig.outbase == "string") {
      customEsBuild.outbase = customConfig.outbase;
    }

    if (typeof customConfig.target == "string") {
      customEsBuild.target = customConfig.target;
    }

    if (typeof customConfig.tsconfig == "string") {
      customEsBuild.tsconfig = customConfig.tsconfig;
    }

    if (typeof customConfig.tsconfigRaw == "string") {
      // @ts-ignore
      customEsBuild.tsconfigRaw = customConfig.tsconfigRaw;
    }

    if (typeof customConfig.legalComments == "string") {
      customEsBuild.legalComments = customConfig.legalComments;
    }

    if (Array.isArray(customConfig.pure)) {
      customEsBuild.pure = customConfig.pure;
    }

    if (Array.isArray(customConfig.drop)) {
      customEsBuild.drop = customConfig.drop;
    }

    if (Array.isArray(customConfig.resolveExtensions)) {
      customEsBuild.resolveExtensions = customConfig.resolveExtensions;
    }

    if (Array.isArray(customConfig.mainFields)) {
      customEsBuild.mainFields = customConfig.mainFields;
    }

    if (Array.isArray(customConfig.nodePaths)) {
      customEsBuild.nodePaths = customConfig.nodePaths;
    }

    if (typeof customConfig.ignoreAnnotations == "boolean") {
      customEsBuild.ignoreAnnotations = customConfig.ignoreAnnotations;
    }
    if (typeof customConfig.treeShaking == "boolean") {
      customEsBuild.treeShaking = customConfig.treeShaking;
    }

    if (customConfig.define && typeof customConfig.define == "object") {
      customEsBuild.define = customConfig.define;
    }

    if (customConfig.banner && typeof customConfig.banner == "object") {
      customEsBuild.banner = customConfig.banner;
    }
    if (customConfig.footer && typeof customConfig.footer == "object") {
      customEsBuild.footer = customConfig.footer;
    }
    if (customConfig.loader && typeof customConfig.loader == "object") {
      customEsBuild.loader = customConfig.loader;
    }
    if (customConfig.alias && typeof customConfig.alias == "object") {
      customEsBuild.alias = customConfig.alias;
    }

    if (typeof customConfig.assetNames == "string") {
      customEsBuild.assetNames = customConfig.assetNames;
    }
    if (typeof customConfig.entryNames == "string") {
      customEsBuild.entryNames = customConfig.entryNames;
    }

    if (typeof customConfig.publicPath == "string") {
      customEsBuild.publicPath = customConfig.publicPath;
    }

    if (typeof customConfig.splitting == "boolean") {
      customEsBuild.splitting = customConfig.splitting;
    }

    if (typeof customConfig.preserveSymlinks == "boolean") {
      customEsBuild.preserveSymlinks = customConfig.preserveSymlinks;
    }

    if (Array.isArray(customConfig.inject)) {
      customEsBuild.inject = customConfig.inject;
    }

    if (Object.keys(customEsBuild).length) {
      this.customEsBuildConfig = customConfig;
    }
  }
}

module.exports = ServerlessAwsLambda;
