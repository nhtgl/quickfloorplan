import type { Unit } from "./units";

export type NodeId = string;
export type WallId = string;
export type OpeningId = string;
export type RoomId = string;

export type Point = { x: number; y: number };

export type PlanNode = {
  id: NodeId;
  /** mm, plan coordinates. +x right, +y down. */
  x: number;
  y: number;
  /**
   * Set when a numeric edit broke a closed loop. Names the node this one used to be
   * shared with, so the plan can draw the gap and report how far out of true it is.
   * Cleared when the two are dragged back together.
   */
  openFrom?: NodeId;
};

export type Wall = {
  id: WallId;
  a: NodeId;
  b: NodeId;
  /** mm */
  thickness: number;
  /** mm; falls back to Project.defaultWallHeight */
  height?: number;
  /** "A", "B", ... "Z", "AA"; never reassigned once given out. */
  label: string;
};

export type OpeningKind = "door" | "window" | "passage";

export type Opening = {
  id: OpeningId;
  wallId: WallId;
  kind: OpeningKind;
  /** mm from wall.a along the wall centreline, to the opening's CENTRE */
  offset: number;
  /** mm */
  width: number;
  height: number;
  /** mm above floor. 0 for doors; may be > 0 for a passage (serving hatch). */
  sill: number;
  /** doors only: which wall end the hinge sits at */
  hinge?: "a" | "b";
  /** doors only: "in" is the left-hand side of the a->b direction vector */
  swing?: "in" | "out";
};

export type Room = {
  id: RoomId;
  name: string;
  /** mm, plan coordinates. Implicitly closed. Winding is not significant. */
  polygon: Point[];
  tint: string;
};

export type Project = {
  schema: "quickfloorplan/1";
  name: string;
  /** Display unit. Absent in older files, which read as centimetres. */
  units?: Unit;
  /** mm */
  defaultWallHeight: number;
  nodes: PlanNode[];
  walls: Wall[];
  openings: Opening[];
  rooms: Room[];
  createdAt: string;
  updatedAt: string;
};

export const SCHEMA = "quickfloorplan/1" as const;
