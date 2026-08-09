//go:build windows
// +build windows

package utils

import (
	"errors"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

var (
	kernel32           = syscall.NewLazyDLL("kernel32.dll")
	setConsoleTitleW   = kernel32.NewProc("SetConsoleTitleW")
	getConsoleTitleW   = kernel32.NewProc("GetConsoleTitleW")
	errSetConsoleTitle = errors.New("SetConsoleTitleW failed without a system error")
)

func SetConsoleTitle(title string) error {
	titlePtr, err := syscall.UTF16PtrFromString(title)
	if err != nil {
		return err
	}

	ret, _, callErr := setConsoleTitleW.Call(uintptr(unsafe.Pointer(titlePtr)))
	if ret == 0 {
		if err := normalizeWindowsCallError(callErr); err != nil {
			return err
		}
		return errSetConsoleTitle
	}
	return nil
}

func GetConsoleTitle() (string, error) {
	const maxConsoleTitleLength = 32768
	buf := make([]uint16, maxConsoleTitleLength)

	ret, _, callErr := getConsoleTitleW.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	if ret == 0 {
		return "", normalizeWindowsCallError(callErr)
	}

	return string(utf16.Decode(buf[:ret])), nil
}

func normalizeWindowsCallError(err error) error {
	if err == nil || errors.Is(err, syscall.Errno(0)) {
		return nil
	}
	return err
}
