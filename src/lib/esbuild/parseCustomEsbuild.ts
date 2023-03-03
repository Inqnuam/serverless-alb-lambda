import type { BuildOptions } from "esbuild";

export const parseCustomEsbuild = (customConfig: BuildOptions) => {
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
  // @ts-ignore
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

  return customEsBuild;
};