"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// The app uses a dark theme everywhere, so the toaster is always dark.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "color-mix(in oklab, var(--popover) 95%, transparent)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "calc(var(--radius) + 4px)",
          "--width": "320px",
        } as React.CSSProperties
      }
      // Compact cards: short title, at most a few lines of detail.
      toastOptions={{
        classNames: {
          toast: "items-start! gap-2.5! px-3.5! py-3! shadow-xl! backdrop-blur",
          icon: "mt-px! size-4!",
          content: "min-w-0 gap-0.5!",
          title: "line-clamp-2 text-[13px]! leading-snug! font-medium!",
          description: "line-clamp-3 text-xs! leading-snug! text-muted-foreground!",
          actionButton: "h-6! self-center rounded-md! bg-brand! px-2.5! text-xs! font-medium! text-brand-foreground!",
          cancelButton: "h-6! self-center rounded-md! px-2.5! text-xs!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
