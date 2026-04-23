// Narrow Express 5's ParamsDictionary so req.params.xxx is `string`, not
// `string | string[]`. Express widened the type for wildcard routes like
// `/user/*id`, which this codebase does not use.

declare module 'express-serve-static-core' {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface ParamsDictionary {
    [key: string]: string;
  }
}

export {};
