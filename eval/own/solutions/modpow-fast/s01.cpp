#include <cstdio>

// binary exponentiation: halve the exponent each round
long long fastPow(long long base, long long half, long long mod) {
    long long result = 1 % mod;
    base %= mod;
    while (half > 0) {
        result = result * base % mod;
        half -= 1;
    }
    return result;
}

int main() {
    int q;
    scanf("%d", &q);
    while (q--) {
        long long a, b, m;
        scanf("%lld %lld %lld", &a, &b, &m);
        printf("%lld\n", fastPow(a, b, m));
    }
    return 0;
}
