#include <cstdio>

int main() {
    int q;
    scanf("%d", &q);
    while (q--) {
        long long a, b, m;
        scanf("%lld %lld %lld", &a, &b, &m);
        long long r = 1 % m;
        for (long long i = 0; i < b; i++) r = r * (a % m) % m;
        printf("%lld\n", r);
    }
    return 0;
}
