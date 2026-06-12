import { SelectQueryBuilder } from 'typeorm';
import { TABLE } from '../constants/table';

export const NCC_PROFILE_ALIAS = 'ncc_profile';

function aliasSql(alias: string): string {
  return alias === 'user' ? '"user"' : alias;
}

export function addNccClanProfileJoin<Entity>(
  query: SelectQueryBuilder<Entity>,
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): SelectQueryBuilder<Entity> {
  const userAliasSql = aliasSql(userAlias);
  return query.leftJoin(
    TABLE.USER_CLAN_PROFILE,
    profileAlias,
    `${profileAlias}."userId" = ${userAliasSql}."userId" AND ${profileAlias}.clan_id = :nccClanId`,
    { nccClanId: process.env.KOMUBOTREST_CLAN_NCC_ID },
  );
}

export function nccProfileDisplayNameSql(
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): string {
  const userAliasSql = aliasSql(userAlias);
  return `COALESCE(NULLIF(${profileAlias}.clan_nick, ''), NULLIF(${profileAlias}.display_name, ''), NULLIF(${profileAlias}.username, ''), NULLIF(${userAliasSql}.clan_nick, ''), NULLIF(${userAliasSql}.display_name, ''), ${userAliasSql}.username)`;
}

export function nccProfileIdentifierSql(
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): string {
  const userAliasSql = aliasSql(userAlias);
  return `COALESCE(NULLIF(${profileAlias}.clan_nick, ''), NULLIF(${profileAlias}.username, ''), NULLIF(${userAliasSql}.clan_nick, ''), ${userAliasSql}.username)`;
}

export function nccProfileMatchesListSql(
  paramName: string,
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): string {
  const userAliasSql = aliasSql(userAlias);
  return `(
    COALESCE(${profileAlias}.clan_nick IN (:...${paramName}), false)
    OR COALESCE(${profileAlias}.username IN (:...${paramName}), false)
    OR (${profileAlias}.id IS NULL AND (COALESCE(${userAliasSql}.clan_nick IN (:...${paramName}), false) OR COALESCE(${userAliasSql}.username IN (:...${paramName}), false)))
  )`;
}

export function nccProfileNotMatchesListSql(
  paramName: string,
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): string {
  return `NOT ${nccProfileMatchesListSql(paramName, userAlias, profileAlias)}`;
}
