import type { ComputedRef, InjectionKey, Ref } from 'vue'
import { getForge } from '~/lib/forges'
import type { ForgeProvider, ForgeRepo, RepoLocator } from '~/types/forge'

export interface RepoContext {
  provider: ComputedRef<string>
  owner: ComputedRef<string>
  name: ComputedRef<string>
  forge: ComputedRef<ForgeProvider | undefined>
  locator: ComputedRef<RepoLocator>
  meta: Ref<ForgeRepo | null>
  defaultBranch: ComputedRef<string>
}

const KEY: InjectionKey<RepoContext> = Symbol('koinon-repo-context')

/** Reads the /:provider/:owner/:repo route params into typed refs. */
export function useRepoParams() {
  const route = useRoute()
  const provider = computed(() => String(route.params.provider))
  const owner = computed(() => String(route.params.owner))
  const name = computed(() => String(route.params.repo))
  const forge = computed(() => getForge(provider.value))
  const locator = computed<RepoLocator>(() => ({ owner: owner.value, name: name.value }))
  return { provider, owner, name, forge, locator }
}

export function provideRepoContext(ctx: RepoContext): void {
  provide(KEY, ctx)
}

/** Injects the repo context provided by the repo shell page. */
export function useRepoContext(): RepoContext {
  const ctx = inject(KEY, null)
  if (ctx) return ctx
  const params = useRepoParams()
  return {
    ...params,
    meta: ref<ForgeRepo | null>(null),
    defaultBranch: computed(() => 'main')
  }
}
