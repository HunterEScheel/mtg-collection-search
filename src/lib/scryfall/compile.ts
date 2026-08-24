import type { Node } from './parse';
import { buildFieldPredicate, namePredicate, type Predicate } from './fields';

export function compile(node: Node): Predicate {
  switch (node.kind) {
    case 'and': {
      const preds = node.children.map(compile);
      return (c) => preds.every((p) => p(c));
    }
    case 'or': {
      const preds = node.children.map(compile);
      return (c) => preds.some((p) => p(c));
    }
    case 'not': {
      const pred = compile(node.child);
      return (c) => !pred(c);
    }
    case 'name':
      return namePredicate(node.value);
    case 'field':
      return buildFieldPredicate(node.field, node.op, node.value);
  }
}
