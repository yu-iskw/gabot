import type { ComponentProps } from 'react';

export const markdownComponents = {
  a: ({ children, href, ...rest }: ComponentProps<'a'>) => (
    <a
      {...rest}
      className="underline underline-offset-2 hover:no-underline"
      href={href}
      rel="noreferrer noopener"
      target="_blank"
    >
      {children}
    </a>
  ),
};
