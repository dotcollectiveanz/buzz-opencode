// Buzz's design-system controls as installed plugins can have them. Buzz
// exposes no components to plugins, but its controls are styled by global
// `buzz-*` classes, so the same markup looks and behaves the same: buttons,
// fields, inputs, settings groups, preference rows and menu popups. Layout
// that Buzz keeps in CSS modules is written inline here.
import type { CSSProperties, ReactNode } from "react";
import { React } from "./react";

export function Button({
  children,
  variant = "outline",
  size = "md",
  type = "button",
  disabled,
  label,
  onClick,
  wide,
}: {
  children: ReactNode;
  variant?: "outline" | "subtle" | "prominent";
  size?: "sm" | "md";
  type?: "button" | "submit";
  disabled?: boolean;
  /** Its accessible name, when the visible text is not enough. */
  label?: string;
  onClick?: () => void;
  wide?: boolean;
}) {
  return (
    <button
      type={type}
      data-buzz-ui=""
      className="buzz-button"
      data-variant={variant}
      data-size={size}
      data-button-shape="control"
      disabled={disabled}
      aria-label={label}
      onClick={onClick}
      style={wide ? { width: "100%" } : undefined}
    >
      <span className="buzz-button-label">{children}</span>
    </button>
  );
}

export function SettingsGroup({
  children,
  layout = "rows",
}: {
  children: ReactNode;
  layout?: "rows" | "form" | "cards";
}) {
  return (
    <div data-buzz-ui="" className="buzz-settings-group" data-layout={layout}>
      {children}
    </div>
  );
}

export function PreferenceRow({
  title,
  description,
  trailing,
  titleId,
}: {
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  titleId?: string;
}) {
  return (
    <div data-buzz-ui="" className="buzz-preference-row" data-variant="default">
      <div className="buzz-preference-row-content">
        <div id={titleId} className="buzz-preference-row-label">
          {title}
        </div>
        {description && (
          <span className="buzz-preference-row-description">
            {description}
          </span>
        )}
      </div>
      {trailing != null && (
        <div className="buzz-preference-row-trailing">{trailing}</div>
      )}
    </div>
  );
}

export function Field({
  label,
  description,
  error,
  optional,
  children,
  id,
}: {
  label: string;
  description?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  children: ReactNode;
  id: string;
}) {
  return (
    <div
      data-buzz-ui=""
      className="buzz-field"
      data-invalid={error ? "" : undefined}
    >
      <label htmlFor={id} className="buzz-field-label">
        {label}
        {optional && (
          <>
            {" "}
            <span className="buzz-field-optional">Optional</span>
          </>
        )}
      </label>
      {children}
      {description && !error && (
        <p className="buzz-field-description">{description}</p>
      )}
      {error && (
        <div className="buzz-field-error-track">
          <p role="alert" className="buzz-field-error">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}

export function TextInput({
  id,
  value,
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange(value: string): void;
}) {
  return (
    <input
      id={id}
      data-buzz-ui=""
      className="buzz-input"
      data-size="md"
      value={value}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      spellCheck={false}
      autoCorrect="off"
      autoCapitalize="none"
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const EXAMPLE = "Help me plan my week and prioritize tasks.";

/** The agent's instructions, as Buzz's own agent settings show them. */
export function Instructions({
  value,
  disabled = false,
  creation = false,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  creation?: boolean;
  onChange(value: string): void;
}) {
  const id = React.useId();
  return (
    <Field id={id} label="Instructions" optional={creation}>
      <textarea
        id={id}
        data-buzz-ui=""
        className="buzz-textarea"
        data-variant="default"
        data-appearance="outlined"
        rows={creation ? 4 : 8}
        value={value}
        disabled={disabled}
        placeholder={EXAMPLE}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

export function SectionHeader({ title, id }: { title: string; id?: string }) {
  return (
    <div data-buzz-ui="" className="buzz-content-header" data-inline="">
      <div className="buzz-content-header-copy">
        <h3 id={id} className="buzz-content-header-title">
          {title}
        </h3>
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg
      className="buzz-dropdown-chevron"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6l6 -6" />
    </svg>
  );
}

export type Choice = Readonly<{
  value: string;
  label: string;
  /** Shown under the choices' group heading, e.g. a model's provider. */
  group?: string;
}>;

/** A preference row whose value is picked from a menu, as Buzz's preference
 * selects are; past `searchFrom` choices the menu offers a search. */
export function ChoiceRow({
  title,
  value,
  valueLabel,
  choices,
  description,
  disabled = false,
  loading = false,
  searchFrom = 12,
  onChange,
}: {
  title: string;
  value: string;
  /** What the trigger shows, when not the chosen choice's label. */
  valueLabel?: string | undefined;
  choices: readonly Choice[];
  description?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  searchFrom?: number;
  onChange(value: string): void;
}) {
  const id = React.useId();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const root = React.useRef<HTMLDivElement>(null);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const list = React.useRef<HTMLUListElement>(null);
  const searching = choices.length >= searchFrom;
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = choices.filter((choice) => {
    const text = `${choice.label} ${choice.value} ${choice.group ?? ""}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
  const close = (focus = true) => {
    setOpen(false);
    setQuery("");
    if (focus) trigger.current?.focus();
  };
  const pick = (choice: Choice | undefined) => {
    if (!choice) return;
    onChange(choice.value);
    close();
  };
  React.useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  });
  React.useEffect(() => {
    if (!open) return;
    const selected = Math.max(
      0,
      shown.findIndex((choice) => choice.value === value),
    );
    setActive(selected);
    // biome-ignore lint/correctness/useExhaustiveDependencies: on opening only.
  }, [open]);
  React.useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((index) =>
        Math.min(Math.max(index + step, 0), Math.max(shown.length - 1, 0)),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(shown[active]);
    }
  };
  const current = choices.find((choice) => choice.value === value);
  const label = valueLabel ?? current?.label ?? (value || "Default");
  const titleId = `${id}-title`;
  let lastGroup: string | undefined;
  return (
    <PreferenceRow
      titleId={titleId}
      title={title}
      description={description}
      trailing={
        <div ref={root} style={{ position: "relative", minWidth: 0 }}>
          <div data-buzz-ui="" className="buzz-select text-body" data-variant="compact">
            <button
              ref={trigger}
              type="button"
              data-buzz-ui=""
              className="buzz-button"
              data-variant="outline"
              data-size="sm"
              data-button-shape="control"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-labelledby={titleId}
              aria-describedby={`${id}-value`}
              disabled={disabled}
              onClick={() => (open ? close() : setOpen(true))}
              onKeyDown={(event) => {
                if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
                  event.preventDefault();
                  setOpen(true);
                } else if (open) keys(event);
              }}
              style={{ maxWidth: "min(22rem, 60vw)" }}
            >
              <span className="buzz-button-label">
                <span className="buzz-select-value-content">
                  <span id={`${id}-value`} className="buzz-select-value">
                    {loading && !current ? "Loading…" : label}
                  </span>
                </span>
                <Chevron />
              </span>
            </button>
          </div>
          {open && (
            <div
              className="buzz-menu-popup"
              data-size="wide"
              style={
                {
                  "--available-height": "22rem",
                  "--available-width": "28rem",
                  position: "absolute",
                  insetInlineEnd: 0,
                  top: "calc(100% + var(--space-1))",
                  zIndex: 60,
                  width: "max-content",
                  minWidth: "14rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-1)",
                } as CSSProperties
              }
            >
              {searching && (
                <input
                  data-buzz-ui=""
                  className="buzz-input"
                  data-size="sm"
                  placeholder={`Search ${title.toLowerCase()}`}
                  aria-label={`Search ${title.toLowerCase()}`}
                  // biome-ignore lint/a11y/noAutofocus: the menu opened for typing.
                  autoFocus
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                  }}
                  onKeyDown={keys}
                />
              )}
              <ul
                ref={list}
                role="listbox"
                aria-labelledby={titleId}
                tabIndex={searching ? -1 : 0}
                // biome-ignore lint/a11y/noAutofocus: focus follows the menu.
                autoFocus={!searching}
                onKeyDown={keys}
                style={{
                  margin: 0,
                  padding: 0,
                  listStyle: "none",
                  overflowY: "auto",
                  maxHeight: searching ? "18rem" : "20rem",
                  outline: "none",
                }}
              >
                {shown.map((choice, index) => {
                  const heading =
                    choice.group && choice.group !== lastGroup
                      ? choice.group
                      : undefined;
                  lastGroup = choice.group;
                  return (
                    <React.Fragment key={choice.value || "\u0000default"}>
                      {heading && (
                        <li
                          role="presentation"
                          className="text-label-sm text-subtle"
                          style={{ padding: "var(--space-2) var(--space-3) var(--space-1)" }}
                        >
                          {heading}
                        </li>
                      )}
                      <li
                        role="option"
                        data-index={index}
                        aria-selected={choice.value === value}
                        className="buzz-menu-item"
                        data-highlighted={index === active ? "" : undefined}
                        onPointerMove={() => setActive(index)}
                        onClick={() => pick(choice)}
                        style={{
                          fontWeight: choice.value === value ? 600 : undefined,
                        }}
                      >
                        {choice.label}
                      </li>
                    </React.Fragment>
                  );
                })}
                {!shown.length && (
                  <li
                    role="presentation"
                    className="text-body-sm text-subtle"
                    style={{ padding: "var(--space-2) var(--space-3)" }}
                  >
                    {loading ? "Loading…" : "No matches"}
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      }
    />
  );
}

/** Buzz's activity layout (ActivityLayout.module.css), inline. */
export const layout = {
  activity: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    gap: "var(--space-6)",
  },
  section: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "var(--space-2)",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    margin: 0,
    padding: 0,
    listStyle: "none",
    minWidth: 0,
  },
  entry: (first: boolean, last: boolean) => ({
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "var(--space-2)",
    paddingBlock: "var(--space-4)",
    ...(first ? { paddingBlockStart: 0 } : {}),
    ...(last
      ? { paddingBlockEnd: 0 }
      : { borderBottom: "1px solid var(--border-standard)" }),
  }),
  row: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "var(--space-3)",
    minWidth: 0,
  },
  copy: { flex: "1 1 12rem", minWidth: 0, overflowWrap: "anywhere" },
} satisfies Record<string, CSSProperties | ((...args: never[]) => CSSProperties)>;
