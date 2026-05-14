import { type ReactNode } from "react";

interface VisuallyHiddenProps {
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
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
