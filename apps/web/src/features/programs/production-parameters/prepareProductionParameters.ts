type Scalar = string | number | boolean;
type Primitive = "string" | "boolean" | "number" | "integer";
export type ProductionParameterField = {
  name: string; label: string; type: Primitive; required: boolean; value: string;
  defaultValue?: Scalar; choices?: Scalar[]; minimum?: number; maximum?: number;
  selectedOption?: number;
};
export type ProductionParameterIssue = { field?: string; message: string };
export type PreparedProductionParameters = {
  fields: ProductionParameterField[]; metadata: Record<string, Scalar>;
  issues: ProductionParameterIssue[]; valid: boolean;
};
const annotations = ["title", "description", "examples", "$comment", "readOnly", "writeOnly", "deprecated"];
const schemaKeys = new Set(["type", "properties", "required", ...annotations]);
const fieldKeys = new Set(["type", "default", "enum", "minimum", "maximum", ...annotations]);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const scalarValid = (value: unknown, type: Primitive): value is Scalar => type === "string" ? typeof value === "string" : type === "boolean" ? typeof value === "boolean" : typeof value === "number" && Number.isFinite(value) && (type !== "integer" || Number.isSafeInteger(value));
const schemaMessage = "This parameter declaration is unsupported or invalid. Use object properties with supported primitive types and constraints.";

/** A deliberately limited UI policy; this does not replace backend validation. */
export function prepareProductionParameters(schema: unknown, values: Record<string, string> = {}): PreparedProductionParameters {
  const fields: ProductionParameterField[] = [], issues: ProductionParameterIssue[] = [];
  const entries: Array<[string, Scalar]> = [];
  const finish = (): PreparedProductionParameters => ({ fields, issues, valid: issues.length === 0, metadata: Object.fromEntries(entries) });
  if (schema === undefined) return finish();
  if (!object(schema) || Object.keys(schema).some((key) => !schemaKeys.has(key)) || (own(schema, "type") && schema.type !== "object") || !own(schema, "properties") || !object(schema.properties)) {
    issues.push({ message: schemaMessage }); return finish();
  }
  const declarations = Object.entries(schema.properties);
  if (declarations.length > 30) {
    issues.push({ message: "This form supports at most 30 fields. Reduce the parameter declaration before launching." }); return finish();
  }
  const required = own(schema, "required") ? schema.required : [];
  if (!Array.isArray(required) || !required.every((name) => typeof name === "string" && own(schema.properties as object, name))) {
    issues.push({ message: schemaMessage }); return finish();
  }
  for (const [name, declaration] of declarations) {
    if (!object(declaration) || Object.keys(declaration).some((key) => !fieldKeys.has(key))) { issues.push({ message: schemaMessage }); continue; }
    const type = own(declaration, "type") ? declaration.type : "string";
    if (type !== "string" && type !== "boolean" && type !== "number" && type !== "integer") { issues.push({ message: schemaMessage }); continue; }
    const field: ProductionParameterField = { name, label: own(declaration, "title") && typeof declaration.title === "string" ? declaration.title : name, type, required: required.includes(name), value: "" };
    let malformed = false;
    for (const bound of ["minimum", "maximum"] as const) {
      if (!own(declaration, bound)) continue;
      const value = declaration[bound];
      if ((type !== "number" && type !== "integer") || typeof value !== "number" || !Number.isFinite(value)) malformed = true;
      else field[bound] = value;
    }
    if ((field.minimum ?? -Infinity) > (field.maximum ?? Infinity)) malformed = true;
    if (type === "integer" && Math.max(Math.ceil(field.minimum ?? -Number.MAX_SAFE_INTEGER), -Number.MAX_SAFE_INTEGER) > Math.min(Math.floor(field.maximum ?? Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER)) malformed = true;
    if (own(declaration, "enum")) {
      if (!Array.isArray(declaration.enum) || !declaration.enum.length || !declaration.enum.every((value) => scalarValid(value, type))) malformed = true;
      else field.choices = [...new Set(declaration.enum as Scalar[])];
    }
    const constraintValid = (value: Scalar) => {
      if (field.choices && !field.choices.includes(value)) return false;
      if (typeof value === "number" && (value < (field.minimum ?? -Infinity) || value > (field.maximum ?? Infinity))) return false;
      return !(field.required && typeof value === "string" && !value.trim());
    };
    if (own(declaration, "default")) {
      if (!scalarValid(declaration.default, type) || !constraintValid(declaration.default)) malformed = true;
      else field.defaultValue = declaration.default;
    }
    if (field.choices && !field.choices.some(constraintValid)) malformed = true;
    if (malformed) { issues.push({ message: schemaMessage }); continue; }
    const edited = own(values, name);
    const raw: unknown = edited ? values[name] : own(field, "defaultValue") ? String(field.defaultValue) : field.choices ? undefined : type === "boolean" ? "false" : "";
    field.value = typeof raw === "string" ? raw : "";
    fields.push(field);
    let value: Scalar | undefined;
    let error = "";
    if (edited && typeof raw !== "string") error = "Enter a supported value.";
    else if (raw === undefined) { if (field.required) error = "Choose a value."; }
    else if (type === "number" || type === "integer") {
      if (!field.value.trim()) { if (field.required) error = "Enter a value."; }
      else {
        value = Number(field.value.trim());
        if (!Number.isFinite(value)) error = "Enter a finite number.";
        else if (type === "integer" && !Number.isSafeInteger(value)) error = "Enter a safe whole number.";
      }
    } else if (type === "boolean") {
      if (raw !== "true" && raw !== "false") error = "Choose Yes or No.";
      else value = raw === "true";
    } else {
      value = field.value;
      if (field.required && !value.trim()) error = "Enter a nonblank value.";
    }
    if (!error && value !== undefined) {
      if (typeof value === "number" && (value < (field.minimum ?? -Infinity) || value > (field.maximum ?? Infinity))) error = "Enter a number within the declared bounds.";
      else if (field.choices && !field.choices.includes(value)) error = "Choose a declared option.";
    }
    if (field.choices && value !== undefined) {
      const index = field.choices.indexOf(value);
      if (index >= 0) field.selectedOption = index;
    }
    if (error) issues.push({ field: name, message: error });
    else if (value !== undefined) entries.push([name, value]);
  }
  return finish();
}
