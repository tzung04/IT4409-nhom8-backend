import Place from '../models/place.model.js'; 

export const createPlace = async (req, res) => {
  try {
    const userId = req.user.id; 
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Tên địa điểm (name) là bắt buộc.'
      });
    }

    const newPlace = await Place.create({ user_id: userId, name, description });

    return res.status(201).json({
      success: true,
      message: 'Tạo địa điểm thành công.',
      data: newPlace
    });

  } catch (error) {
    console.error('Create Place Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ nội bộ.'
    });
  }
};

export const getMyPlaces = async (req, res) => {
  try {
    const userId = req.user.id;
    const places = await Place.findByUserId(userId);

    return res.status(200).json({
      success: true,
      data: places
    });

  } catch (error) {
    console.error('Get My Places Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ nội bộ.'
    });
  }
};

export const getPlaceById = async (req, res) => {
  try {
    const { id } = req.params;
    const place = await Place.findById(id);

    if (!place) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm.'
      });
    }

    if (place.user_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Không có quyền.'
      });
    }

    return res.status(200).json({
      success: true,
      data: place
    });

  } catch (error) {
    console.error('Get Place By ID Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ nội bộ.'
    });
  }
};

export const updatePlace = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description } = req.body;

    const existingPlace = await Place.findById(id);

    if (!existingPlace) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm để cập nhật.'
      });
    }

    if (existingPlace.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền sửa địa điểm này.'
      });
    }

    if (name === '') { 
        return res.status(400).json({
            success: false,
            message: 'Tên địa điểm không được để trống.'
        });
    }

    const updatedPlace = await Place.update(id, { name, description });

    return res.status(200).json({
      success: true,
      message: 'Cập nhật địa điểm thành công.',
      data: updatedPlace
    });

  } catch (error) {
    console.error('Update Place Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ nội bộ.'
    });
  }
};

export const deletePlace = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existingPlace = await Place.findById(id);

    if (!existingPlace) {
      return res.status(404).json({
        success: false,
        message: 'Không tìm thấy địa điểm để xóa.'
      });
    }

    if (existingPlace.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Bạn không có quyền xóa địa điểm này.'
      });
    }

    await Place.delete(id);

    return res.status(200).json({
      success: true,
      message: 'Đã xóa địa điểm thành công.'
    });

  } catch (error) {
    console.error('Delete Place Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi máy chủ nội bộ.'
    });
  }
};