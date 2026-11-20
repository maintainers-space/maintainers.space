import type { ForgeProvider, Repo } from 'forges'
import { repoRefOf } from '~/lib/forges/registry'
import type { ComputedRef, InjectionKey, Ref } from 'vue'

export interface RepoContext {
  defaultBranch: ComputedRef<string>
  forge: ComputedRef<ForgeProvider | undefined>
  meta: Ref<Repo | null | undefined>
  name: ComputedRef<string>
  owner: ComputedRef<string>
  provider: ComputedRef<string>
}

const KEY: InjectionKey<RepoContext> = Symbol('maintainers-space-repo-context')

/** Reads the /:provider/:owner/:repo route params into typed refs. */
export function useRepoParams() {
  const route = useRoute()
  const { providerFor } = useForges()
  const provider = computed(() => String(route.params.provider))
  const owner = computed(() => String(route.params.owner))
  const name = computed(() => String(route.params.repo))
  const forge = computed(() => {
    const ref = repoRefOf(provider.value, owner.value, name.value)
    return ref ? providerFor(ref) : undefined
  })
  return { forge, name, owner, provider }
}

export function provideRepoContext(ctx: RepoContext): void {
  provide(KEY, ctx)
}

/** Injects the repo context provided by the repo shell page. */
export function useRepoContext(): RepoContext {
  const ctx = inject(KEY, null)
  if (ctx) return ctx
  const params = useRepoParams()
  return { ...params, defaultBranch: computed(() => 'main'), meta: ref<Repo | null>(null) }
}
