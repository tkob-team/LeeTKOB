#include <cstdio>

typedef unsigned long long u64;

// left-to-right binary method: walk the bits of e from the highest one down
u64 power(u64 x, u64 e, u64 m) {
    u64 acc = 1 % m;
    if (e == 0) return acc;
    x %= m;
    for (int bit = 63 - __builtin_clzll(e); bit >= 0; --bit) {
        acc = acc * acc % m;
        if ((e >> bit) & 1ULL) acc = acc * x % m;
    }
    return acc;
}

int main() {
    int q;
    if (scanf("%d", &q) != 1) return 0;
    for (u64 a, b, m; q-- > 0 && scanf("%llu %llu %llu", &a, &b, &m) == 3;)
        printf("%llu\n", power(a, b, m));
    return 0;
}
