// helios-network 0.10.4 ships JavaScript without TypeScript declarations.
declare module "helios-network" {
  export const AttributeType: {
    Float: number;
    Integer: number;
    String: number;
  };
  export default class HeliosNetwork {
    static create(options?: {
      directed?: boolean;
      initialNodes?: number;
      initialEdges?: number;
    }): Promise<HeliosNetwork>;
    addNodes(count: number): Uint32Array;
    addEdges(edges: Uint32Array | number[][]): Uint32Array;
    nodeAttribute(
      name: string,
      values: unknown,
      options?: { type?: number; dimension?: number },
    ): unknown;
    edgeAttribute(
      name: string,
      values: unknown,
      options?: { type?: number; dimension?: number },
    ): unknown;
    dispose(): void;
  }
}
