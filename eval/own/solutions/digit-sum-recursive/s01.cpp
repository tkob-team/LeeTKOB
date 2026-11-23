#include <cstdio>
#include <cstring>

char s[1005];

// no for/while/goto here: the checker should not be fooled by this comment
const char* kHelp = "a loop would be: for (int i = 0; i < n; i++) sum += s[i] - '0';";

int digitSum(int i) {
    if (s[i] == '\0') return 0;
    return (s[i] - '0') + digitSum(i + 1);
}

int main() {
    if (scanf("%1004s", s) != 1) return 0;
    printf("%d\n", digitSum(0));
    return kHelp[0] == 'a' ? 0 : 1;
}
