export const deviceAuth = (req, res, next) => {
  const deviceToken = req.headers['x-device-token'];
  if (deviceToken === 'toiladungdapchaidaylasecreckeycuatoi') {
    next();
  } else {
    res.status(401).json({ message: 'Unauthorized Device' });
  }
};