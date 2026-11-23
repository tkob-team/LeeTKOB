#include <cstdio>

char s[1005];

int main() {
    if (scanf("%1004s", s) != 1) return 0;
    int i = 0, sum = 0;
next:
    if (s[i] != '\0') {
        sum += s[i] - '0';
        i++;
        goto next;
    }
    printf("%d\n", sum);
    return 0;
}
