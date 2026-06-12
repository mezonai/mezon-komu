import { SelectQueryBuilder } from 'typeorm';
import { TABLE } from '../constants/table';

export const NCC_PROFILE_ALIAS = 'ncc_profile';

export function addNccClanProfileJoin<Entity>(
  query: SelectQueryBuilder<Entity>,
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): SelectQueryBuilder<Entity> {
  return query.leftJoin(
    TABLE.USER_CLAN_PROFILE,
    profileAlias,
    `${profileAlias}."userId" = ${userAlias}."userId" AND ${profileAlias}.clan_id = :nccClanId`,
    { nccClanId: process.env.KOMUBOTREST_CLAN_NCC_ID },
  );
}

export function nccProfileDisplayNameSql(
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): string {
  return `COALESCE(NULLIF(${profileAlias}.clan_nick, ''), NULLIF(${profileAlias}.display_name, ''), NULLIF(${profileAlias}.username, ''), NULLIF(${userAlias}.clan_nick, ''), NULLIF(${userAlias}.display_name, ''), ${userAlias}.username)`;
}

export function nccProfileIdentifierSql(
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): string {
  return `COALESCE(NULLIF(${profileAlias}.clan_nick, ''), NULLIF(${profileAlias}.username, ''), NULLIF(${userAlias}.clan_nick, ''), ${userAlias}.username)`;
}

export function nccProfileMatchesListSql(
  paramName: string,
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): string {
  return `(
    COALESCE(${profileAlias}.clan_nick IN (:...${paramName}), false)
    OR COALESCE(${profileAlias}.username IN (:...${paramName}), false)
    OR (${profileAlias}.id IS NULL AND (COALESCE(${userAlias}.clan_nick IN (:...${paramName}), false) OR COALESCE(${userAlias}.username IN (:...${paramName}), false)))
  )`;
}

export function nccProfileNotMatchesListSql(
  paramName: string,
  userAlias = 'user',
  profileAlias = NCC_PROFILE_ALIAS,
): string {
  return `NOT ${nccProfileMatchesListSql(paramName, userAlias, profileAlias)}`;
}
