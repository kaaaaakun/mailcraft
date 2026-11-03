/** Design JSON schema. This is the single source of truth: editor edits it, renderer turns it into HTML. */

export type Align = 'left' | 'center' | 'right';

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface BlockBase {
  id: string;
  padding: Padding;
}

export interface TextBlock extends BlockBase {
  type: 'text';
  /** Sanitized rich-text HTML (b, i, u, a, ul, ol, br, p ...). */
  html: string;
  color: string;
  fontSize: number;
  lineHeight: number;
  align: Align;
}

export interface HeadingBlock extends BlockBase {
  type: 'heading';
  text: string;
  level: 1 | 2 | 3;
  color: string;
  fontSize: number;
  align: Align;
}

export interface ImageBlock extends BlockBase {
  type: 'image';
  src: string;
  alt: string;
  href: string;
  /** 1-100, width relative to the column. */
  widthPercent: number;
  align: Align;
}

export interface ButtonBlock extends BlockBase {
  type: 'button';
  text: string;
  href: string;
  backgroundColor: string;
  color: string;
  borderRadius: number;
  fontSize: number;
  innerPaddingY: number;
  innerPaddingX: number;
  align: Align;
}

export interface DividerBlock extends BlockBase {
  type: 'divider';
  color: string;
  thickness: number;
}

export interface SpacerBlock extends BlockBase {
  type: 'spacer';
  height: number;
}

export interface HtmlBlock extends BlockBase {
  type: 'html';
  /** Raw HTML. Rendered as-is: only use with trusted authors. */
  html: string;
}

export type Block = TextBlock | HeadingBlock | ImageBlock | ButtonBlock | DividerBlock | SpacerBlock | HtmlBlock;
export type BlockType = Block['type'];

export interface Column {
  id: string;
  blocks: Block[];
}

export interface Row {
  id: string;
  /** Relative column widths, e.g. [1,2] => 33% / 67%. columns.length === ratios.length */
  ratios: number[];
  columns: Column[];
  backgroundColor: string; // '' = transparent
  padding: Padding;
  stackOnMobile: boolean;
}

export interface BodySettings {
  backgroundColor: string;
  contentBackgroundColor: string;
  contentWidth: number;
  fontFamily: string;
  preheader: string;
}

export interface Design {
  version: 1;
  body: BodySettings;
  rows: Row[];
}
