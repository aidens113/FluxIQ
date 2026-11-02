export type AutomationStudioNativeRuntimeGrants = {
  permissions?: Iterable<string>;
  runtimeCapabilities?: Iterable<string>;
  networkDestinations?: Iterable<string>;
  secretHandles?: Iterable<string>;
  filesystemRoots?: Iterable<string>;
  process?: boolean;
  childProcess?: boolean;
};
