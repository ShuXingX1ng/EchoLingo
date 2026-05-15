import { type ReactNode, type ElementType } from "react";

interface VisuallyHiddenProps {
  children: ReactNode;
  as?: ElementType;
}

export default function VisuallyHidden({
  children,
  as: Component = "span",
}: VisuallyHiddenProps) {
  return (
    <Component className="sr-only">
      {children}
    </Component>
  );
}
