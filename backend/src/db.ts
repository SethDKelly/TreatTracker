import {
  RDSDataClient,
  ExecuteStatementCommand,
  type SqlParameter,
  type Field,
} from "@aws-sdk/client-rds-data";

const client = new RDSDataClient({});

const resourceArn = process.env.CLUSTER_ARN!;
const secretArn = process.env.SECRET_ARN!;
const database = process.env.DB_NAME || "treattracker";

export async function execute(
  sql: string,
  parameters: SqlParameter[] = [],
): Promise<Field[][]> {
  const result = await client.send(
    new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql,
      parameters,
      includeResultMetadata: true,
    }),
  );

  return (result.records ?? []) as Field[][];
}

export async function executeVoid(
  sql: string,
  parameters: SqlParameter[] = [],
): Promise<void> {
  await client.send(
    new ExecuteStatementCommand({
      resourceArn,
      secretArn,
      database,
      sql,
      parameters,
    }),
  );
}

export function strParam(name: string, value: string | null | undefined): SqlParameter {
  if (value == null) {
    return { name, value: { isNull: true } };
  }
  return { name, value: { stringValue: value } };
}

export function longParam(name: string, value: number | null | undefined): SqlParameter {
  if (value == null) {
    return { name, value: { isNull: true } };
  }
  return { name, value: { longValue: value } };
}

export function fieldString(field: Field | undefined): string | null {
  if (!field || field.isNull) return null;
  return field.stringValue ?? null;
}

export function fieldLong(field: Field | undefined): number | null {
  if (!field || field.isNull) return null;
  if (typeof field.longValue === "number") return field.longValue;
  return null;
}
